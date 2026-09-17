import assert from 'node:assert/strict';
import { conceptLabelFontSize } from '../src/map-visuals.mjs';

const regionalSize = conceptLabelFontSize(0.7, 2);
const streetSize = conceptLabelFontSize(1.25, 2);
const closeSize = conceptLabelFontSize(2.5, 2);
const selectedSize = conceptLabelFontSize(1.25, 2, true);

assert.ok(regionalSize >= 13, `Regional labels are too small: ${regionalSize}px`);
assert.ok(streetSize >= 16, `Street labels are too small: ${streetSize}px`);
assert.ok(closeSize >= 19, `Close labels are too small: ${closeSize}px`);
assert.ok(streetSize > regionalSize, 'Labels must grow between regional and street zoom');
assert.ok(closeSize > streetSize, 'Labels must keep growing at close zoom');
assert.ok(selectedSize >= streetSize + 1, 'Selected labels must be more prominent');

console.log({ regionalSize, streetSize, closeSize, selectedSize });
