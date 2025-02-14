// import Immutable from 'immutable'; // eslint-disable-line no-unused-vars
import invariant from 'invariant';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { convertToRaw } from 'draft-js-greger';

import encodeBlock from './encodeBlock';
import blockEntities from './blockEntities';
import blockInlineStyles from './blockInlineStyles';

import accumulateFunction from './util/accumulateFunction';
import blockTypeObjectFunction from './util/blockTypeObjectFunction';
import getBlockTags from './util/getBlockTags';
import getNestedBlockTags from './util/getNestedBlockTags';

import defaultBlockHTML from './default/defaultBlockHTML';

const defaultEntityToHTML = (entity, originalText) => {
  return originalText;
};

const convertToHTML = ({
  styleToHTML = {},
  blockToHTML = {},
  entityToHTML = defaultEntityToHTML,
  blockToHTML2,
}) => contentState => {
  invariant(
    contentState !== null && contentState !== undefined,
    'Expected contentState to be non-null'
  );

  let getBlockHTML;
  if (blockToHTML.__isMiddleware === true) {
    getBlockHTML = blockToHTML(blockTypeObjectFunction(defaultBlockHTML));
  } else if (blockToHTML2) {
    getBlockHTML = accumulateFunction(
      blockToHTML2,
      blockTypeObjectFunction(blockToHTML)
    );
  } else {
    getBlockHTML = accumulateFunction(
      blockTypeObjectFunction(blockToHTML),
      blockTypeObjectFunction(defaultBlockHTML)
    );
  }

  const rawState = convertToRaw(contentState);

  let listStack = [];

  let result = rawState.blocks
    .map(block => {
      const { type, depth } = block;

      let closeNestTags = '';
      let openNestTags = '';

      const blockHTMLResult = getBlockHTML(block);
      if (!blockHTMLResult) {
        throw new Error(
          `convertToHTML: missing HTML definition for block with type ${
            block.type
          }`
        );
      }

      if (!blockHTMLResult.nest) {
        // this block can't be nested, so reset all nesting if necessary
        closeNestTags = listStack.reduceRight((string, nestedBlock) => {
          return (
            string +
            getNestedBlockTags(getBlockHTML(nestedBlock), depth).nestEnd
          );
        }, '');
        listStack = [];
      } else {
        while (
          depth + 1 !== listStack.length ||
          type !== listStack[depth].type
        ) {
          if (depth + 1 === listStack.length) {
            // depth is right but doesn't match type
            const blockToClose = listStack[depth];
            closeNestTags += getNestedBlockTags(
              getBlockHTML(blockToClose),
              depth
            ).nestEnd;
            openNestTags += getNestedBlockTags(getBlockHTML(block), depth)
              .nestStart;
            listStack[depth] = block;
          } else if (depth + 1 < listStack.length) {
            const blockToClose = listStack[listStack.length - 1];
            closeNestTags += getNestedBlockTags(
              getBlockHTML(blockToClose),
              depth
            ).nestEnd;
            listStack = listStack.slice(0, -1);
          } else {
            openNestTags += getNestedBlockTags(getBlockHTML(block), depth)
              .nestStart;
            listStack.push(block);
          }
        }
      }

      const innerHTML = blockInlineStyles(
        blockEntities(encodeBlock(block), rawState.entityMap, entityToHTML),
        styleToHTML
      );

      let html;
      if (innerHTML) {
        const blockHTML = getBlockTags(getBlockHTML(block));
  
        if (typeof blockHTML === 'string') {
          html = blockHTML;
        } else {
          html = blockHTML.start + innerHTML + blockHTML.end;
        }
  
        if (
          innerHTML.length === 0 &&
          Object.prototype.hasOwnProperty.call(blockHTML, 'empty')
        ) {
          if (React.isValidElement(blockHTML.empty)) {
            html = ReactDOMServer.renderToStaticMarkup(blockHTML.empty);
          } else {
            html = blockHTML.empty;
          }
        }
      }
      else {
        html = getBlockTags(getBlockHTML(block), true);
      }

      return closeNestTags + openNestTags + html;
      
    })
    .join('');

  result = listStack.reduce((res, nestBlock) => {
    return (
      res + getNestedBlockTags(getBlockHTML(nestBlock), nestBlock.depth).nestEnd
    );
  }, result);

  return result;
};

export default (...args) => {
  if (
    args.length === 1 &&
    Object.prototype.hasOwnProperty.call(args[0], '_map') &&
    args[0].getBlockMap != null
  ) {
    // skip higher-order function and use defaults
    return convertToHTML({})(...args);
  }

  return convertToHTML(...args);
};
