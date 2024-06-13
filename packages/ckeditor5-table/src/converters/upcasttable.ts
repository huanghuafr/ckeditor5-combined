/**
 * @license Copyright (c) 2003-2023, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module table/converters/upcasttable
 */

import type { Element, UpcastDispatcher, UpcastElementEvent, ViewElement, ViewNode } from 'ckeditor5/src/engine.js';

import { createEmptyTableCell } from '../utils/common.js';
import { first } from 'ckeditor5/src/utils.js';

/**
 * Returns a function that converts the table view representation:
 *
 * ```xml
 * <figure class="table"><table>...</table></figure>
 * ```
 *
 * to the model representation:
 *
 * ```xml
 * <table></table>
 * ```
 */
export function upcastTableFigure() {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( 'element:figure', ( evt, data, conversionApi ) => {
			// Do not convert if this is not a "table figure".
			if ( !conversionApi.consumable.test( data.viewItem, { name: true, classes: 'table' } ) ) {
				return;
			}

			// Find a table element inside the figure element.
			const viewTable = getViewTableFromFigure( data.viewItem );

			// Do not convert if table element is absent or was already converted.
			if ( !viewTable || !conversionApi.consumable.test( viewTable, { name: true } ) ) {
				return;
			}

			// Consume the figure to prevent other converters from processing it again.
			conversionApi.consumable.consume( data.viewItem, { name: true, classes: 'table' } );

			// Convert view table to model table.
			const conversionResult = conversionApi.convertItem( viewTable, data.modelCursor );

			// Get table element from conversion result.
			const modelTable = first( conversionResult.modelRange!.getItems() as Iterator<Element> );

			// When table wasn't successfully converted then finish conversion.
			if ( !modelTable ) {
				// Revert consumed figure so other features can convert it.
				conversionApi.consumable.revert( data.viewItem, { name: true, classes: 'table' } );

				return;
			}

			conversionApi.convertChildren( data.viewItem, conversionApi.writer.createPositionAt( modelTable, 'end' ) );
			conversionApi.updateConversionResult( modelTable, data );
		} );
	};
}

/**
 * View table element to model table element conversion helper.
 *
 * This conversion helper converts the table element as well as table rows.
 *
 * @returns Conversion helper.
 */
export default function upcastTable() {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( 'element:table', ( evt, data, conversionApi ) => {
			const viewTable = data.viewItem;

			// When element was already consumed then skip it.
			if ( !conversionApi.consumable.test( viewTable, { name: true } ) ) {
				return;
			}

			const { rows, headingRows, headingColumns, footerRows } = scanTable( viewTable );

			// Only set attributes if values is greater then 0.
			const attributes: { headingColumns?: number; headingRows?: number; footerRows?: number } = {};

			if ( headingColumns ) {
				attributes.headingColumns = headingColumns;
			}

			if ( headingRows ) {
				attributes.headingRows = headingRows;
			}

			if ( footerRows ) {
				attributes.footerRows = footerRows;
			}

			const table = conversionApi.writer.createElement( 'table', attributes );

			if ( !conversionApi.safeInsert( table, data.modelCursor ) ) {
				return;
			}

			conversionApi.consumable.consume( viewTable, { name: true } );

			// Upcast table rows in proper order (heading rows first).
			rows.forEach( row => conversionApi.convertItem( row, conversionApi.writer.createPositionAt( table, 'end' ) ) );

			// Convert everything else.
			conversionApi.convertChildren( viewTable, conversionApi.writer.createPositionAt( table, 'end' ) );

			// Create one row and one table cell for empty table.
			if ( table.isEmpty ) {
				const row = conversionApi.writer.createElement( 'tableRow' );
				conversionApi.writer.insert( row, conversionApi.writer.createPositionAt( table, 'end' ) );

				createEmptyTableCell( conversionApi.writer, conversionApi.writer.createPositionAt( row, 'end' ) );
			}

			conversionApi.updateConversionResult( table, data );
		} );
	};
}

/**
 * A conversion helper that skips empty <tr> elements from upcasting at the beginning of the table.
 *
 * An empty row is considered a table model error but when handling clipboard data there could be rows that contain only row-spanned cells
 * and empty TR-s are used to maintain the table structure (also {@link module:table/tablewalker~TableWalker} assumes that there are only
 * rows that have related `tableRow` elements).
 *
 * *Note:* Only the first empty rows are removed because they have no meaning and it solves the issue
 * of an improper table with all empty rows.
 *
 * @returns Conversion helper.
 */
export function skipEmptyTableRow() {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( 'element:tr', ( evt, data ) => {
			if ( data.viewItem.isEmpty && data.modelCursor.index == 0 ) {
				evt.stop();
			}
		}, { priority: 'high' } );
	};
}

/**
 * A converter that ensures an empty paragraph is inserted in a table cell if no other content was converted.
 *
 * @returns Conversion helper.
 */
export function ensureParagraphInTableCell( elementName: string ) {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( `element:${ elementName }`, ( evt, data, { writer } ) => {
			// The default converter will create a model range on converted table cell.
			if ( !data.modelRange ) {
				return;
			}

			const tableCell = data.modelRange.start.nodeAfter as Element;
			const modelCursor = writer.createPositionAt( tableCell, 0 );

			// Ensure a paragraph in the model for empty table cells for converted table cells.
			if ( data.viewItem.isEmpty ) {
				writer.insertElement( 'paragraph', modelCursor );

				return;
			}

			const childNodes = Array.from( tableCell.getChildren() );

			// In case there are only markers inside the table cell then move them to the paragraph.
			if ( childNodes.every( node => node.is( 'element', '$marker' ) ) ) {
				const paragraph = writer.createElement( 'paragraph' );

				writer.insert( paragraph, writer.createPositionAt( tableCell, 0 ) );

				for ( const node of childNodes ) {
					writer.move( writer.createRangeOn( node ), writer.createPositionAt( paragraph, 'end' ) );
				}
			}
		}, { priority: 'low' } );
	};
}

/**
 * Get view `<table>` element from the view widget (`<figure>`).
 */
function getViewTableFromFigure( figureView: ViewElement ) {
	for ( const figureChild of figureView.getChildren() ) {
		if ( figureChild.is( 'element', 'table' ) ) {
			return figureChild;
		}
	}
}

/**
 * Scans table rows and extracts required metadata from the table:
 *
 * headingRows    - The number of rows that go as table headers.
 * headingColumns - The maximum number of row headings.
 * footerRows     - The number of rows that go as table footers.
 * rows           - Sorted `<tr>` elements as they should go into the model - ie. if `<thead>` is inserted after `<tbody>` in the view.
 */
function scanTable( viewTable: ViewElement ) {
	let headingRows = 0;
	let headingColumns: number | undefined = undefined;
	let footerRows = 0;

	// The `<tbody>` and `<thead>` sections in the DOM do not have to be in order `<thead>` -> `<tbody>` and there might be more than one
	// of them. The same principles apply to `<tfoot>` sections.
	// As the model does not have these sections, rows from different sections must be sorted.
	// For example, below is a valid HTML table:
	//
	// <table>
	//   <tbody><tr><td>2</td></tr></tbody>
	//   <thead><tr><td>1</td></tr></thead>
	//   <tbody><tr><td>3</td></tr></tbody>
	// </table>
	//
	// But browsers will render rows in order as: 1 as the heading and 2 and 3 as the body.
	const headRows = [];
	const bodyRows = [];
	const footRows = [];

	// Currently the editor does not support more then one <thead> section.
	// Only the first <thead> from the view will be used as a heading row and the others will be converted to body rows.
	let firstTheadElement;
	let firstTfootElement;

	for ( const tableChild of Array.from( viewTable.getChildren() as IterableIterator<ViewElement> ) ) {
		// Only `<thead>`, `<tbody>` & `<tfoot>` from allowed table children can have `<tr>`s.
		// The else is for future purposes (mainly `<caption>`).
		if ( tableChild.name !== 'tbody' && tableChild.name !== 'thead' && tableChild.name !== 'tfoot' ) {
			continue;
		}

		// Save the first `<thead>` in the table as table header - all other ones will be converted to table body rows.
		if ( tableChild.name === 'thead' && !firstTheadElement ) {
			firstTheadElement = tableChild;
		}

		// Save the first `<tfoot>` in the table as table footer - all other ones will be converted to table body rows.
		if ( tableChild.name === 'tfoot' && !firstTfootElement ) {
			firstTfootElement = tableChild;
		}

		// There might be some extra empty text nodes between the `<tr>`s.
		// Make sure further code operates on `tr`s only. (#145)
		const trs = Array.from( tableChild.getChildren() ).filter(
			( el: ViewNode ): el is ViewElement & { name: 'tr' } => el.is( 'element', 'tr' )
		);

		for ( const tr of trs ) {
			// This <tr> is a child of a first <thead> element.
			if (
				( firstTheadElement && tableChild === firstTheadElement ) ||
				(
					tableChild.name === 'tbody' &&
					Array.from( tr.getChildren() ).length &&
					Array.from( tr.getChildren() ).every( e => e.is( 'element', 'th' ) )
				)
			) {
				headingRows++;
				headRows.push( tr );
			}
			// This <tr> is a child of a first <tfoot> element.
			else if ( firstTfootElement && tableChild === firstTfootElement ) {
				footerRows++;
				footRows.push( tr );
			}
			// For other rows check how many column headings this row has.
			else {
				bodyRows.push( tr );
				const headingCols = scanRowForHeadingColumns( tr );

				if ( !headingColumns || headingCols < headingColumns ) {
					headingColumns = headingCols;
				}
			}
		}
	}

	return {
		headingRows,
		headingColumns: headingColumns || 0,
		footerRows,
		rows: [ ...headRows, ...bodyRows, ...footRows ]
	};
}

/**
 * Scans a `<tr>` element and its children for metadata:
 * - For heading row:
 *     - Adds this row to either the heading or the body rows.
 *     - Updates the number of heading rows.
 * - For body rows:
 *     - Calculates the number of column headings.
 */
function scanRowForHeadingColumns( tr: ViewElement ) {
	let headingColumns = 0;
	let index = 0;

	// Filter out empty text nodes from tr children.
	const children = Array.from( tr.getChildren() as IterableIterator<ViewElement> )
		.filter( child => child.name === 'th' || child.name === 'td' );

	// Count starting adjacent <th> elements of a <tr>.
	while ( index < children.length && children[ index ].name === 'th' ) {
		const th = children[ index ];

		// Adjust columns calculation by the number of spanned columns.
		const colspan = parseInt( th.getAttribute( 'colspan' ) as string || '1' );

		headingColumns = headingColumns + colspan;
		index++;
	}

	return headingColumns;
}
