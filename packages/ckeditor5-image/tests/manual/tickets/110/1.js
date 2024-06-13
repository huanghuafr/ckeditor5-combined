/**
 * @license Copyright (c) 2003-2023, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/* global document, console, window */

import ClassicEditor from '@ckeditor/ckeditor5-editor-classic/src/classiceditor.js';
import EnterPlugin from '@ckeditor/ckeditor5-enter/src/enter.js';
import TypingPlugin from '@ckeditor/ckeditor5-typing/src/typing.js';
import ParagraphPlugin from '@ckeditor/ckeditor5-paragraph/src/paragraph.js';
import HeadingPlugin from '@ckeditor/ckeditor5-heading/src/heading.js';
import ImagePlugin from '../../../../src/image.js';
import UndoPlugin from '@ckeditor/ckeditor5-undo/src/undo.js';
import BalloonToolbar from '@ckeditor/ckeditor5-ui/src/toolbar/balloon/balloontoolbar.js';
import ImageToolbar from '../../../../src/imagetoolbar.js';

ClassicEditor
	.create( document.querySelector( '#editor' ), {
		plugins: [ EnterPlugin, TypingPlugin, ParagraphPlugin, HeadingPlugin, ImagePlugin, UndoPlugin, ImageToolbar, BalloonToolbar ],
		balloonToolbar: [ 'heading', '|', 'undo', 'redo' ],
		image: {
			toolbar: [ 'imageTextAlternative' ]
		}
	} )
	.then( editor => {
		window.editor = editor;
	} )
	.catch( err => {
		console.error( err.stack );
	} );