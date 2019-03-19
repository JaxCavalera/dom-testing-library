import {fuzzyMatches, matches, makeNormalizer} from './matches'
import {getNodeText} from './get-node-text'
import {
  getElementError,
  getGetByElementError,
  firstResultOrNull,
  queryAllByAttribute,
  queryByAttribute,
} from './query-helpers'
import {waitForElement} from './wait-for-element'
import {getConfig} from './config'

// Here are the queries for the library.
// The queries here should only be things that are accessible to both users who are using a screen reader
// and those who are not using a screen reader (with the exception of the data-testid attribute query).

function queryAllLabelsByText(
  container,
  text,
  {exact = true, trim, collapseWhitespace, normalizer} = {},
) {
  const matcher = exact ? matches : fuzzyMatches
  const matchNormalizer = makeNormalizer({collapseWhitespace, trim, normalizer})
  return Array.from(container.querySelectorAll('label')).filter(label =>
    matcher(getNodeText(label), label, text, matchNormalizer),
  )
}

function queryAllByLabelText(
  container,
  text,
  {selector = '*', exact = true, collapseWhitespace, trim, normalizer} = {},
) {
  const matchNormalizer = makeNormalizer({collapseWhitespace, trim, normalizer})
  const labels = queryAllLabelsByText(container, text, {
    exact,
    normalizer: matchNormalizer,
  })
  const labelledElements = labels
    .map(label => {
      if (label.control) {
        return label.control
      }
      /* istanbul ignore if */
      if (label.getAttribute('for')) {
        // we're using this notation because with the # selector we would have to escape special characters e.g. user.name
        // see https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector#Escaping_special_characters
        // <label for="someId">text</label><input id="someId" />

        // .control support has landed in jsdom (https://github.com/jsdom/jsdom/issues/2175)
        return container.querySelector(`[id="${label.getAttribute('for')}"]`)
      }
      if (label.getAttribute('id')) {
        // <label id="someId">text</label><input aria-labelledby="someId" />
        return container.querySelector(
          `[aria-labelledby~="${label.getAttribute('id')}"]`,
        )
      }
      if (label.childNodes.length) {
        // <label>text: <input /></label>
        return label.querySelector(selector)
      }
      return null
    })
    .filter(label => label !== null)
    .concat(queryAllByAttribute('aria-label', container, text, {exact}))

  const possibleAriaLabelElements = queryAllByText(container, text, {
    exact,
    normalizer: matchNormalizer,
  }).filter(el => el.tagName !== 'LABEL') // don't reprocess labels

  const ariaLabelledElements = possibleAriaLabelElements.reduce(
    (allLabelledElements, nextLabelElement) => {
      const labelId = nextLabelElement.getAttribute('id')

      if (!labelId) return allLabelledElements

      // ARIA labels can label multiple elements
      const labelledNodes = Array.from(
        container.querySelectorAll(`[aria-labelledby~="${labelId}"]`),
      )

      return allLabelledElements.concat(labelledNodes)
    },
    [],
  )

  return Array.from(new Set([...labelledElements, ...ariaLabelledElements]))
}

function queryByLabelText(...args) {
  return firstResultOrNull(queryAllByLabelText, ...args)
}

function queryAllByText(
  container,
  text,
  {
    selector = '*',
    exact = true,
    collapseWhitespace,
    trim,
    ignore = 'script, style',
    normalizer,
  } = {},
) {
  const matcher = exact ? matches : fuzzyMatches
  const matchNormalizer = makeNormalizer({collapseWhitespace, trim, normalizer})
  let baseArray = []
  if (typeof container.matches === 'function' && container.matches(selector)) {
    baseArray = [container]
  }
  return [...baseArray, ...Array.from(container.querySelectorAll(selector))]
    .filter(node => !ignore || !node.matches(ignore))
    .filter(node => matcher(getNodeText(node), node, text, matchNormalizer))
}

function queryByText(...args) {
  return firstResultOrNull(queryAllByText, ...args)
}

function queryAllByTitle(
  container,
  text,
  {exact = true, collapseWhitespace, trim, normalizer} = {},
) {
  const matcher = exact ? matches : fuzzyMatches
  const matchNormalizer = makeNormalizer({collapseWhitespace, trim, normalizer})
  return Array.from(container.querySelectorAll('[title], svg > title')).filter(
    node =>
      matcher(node.getAttribute('title'), node, text, matchNormalizer) ||
      matcher(getNodeText(node), node, text, matchNormalizer),
  )
}

function queryByTitle(...args) {
  return firstResultOrNull(queryAllByTitle, ...args)
}
function getTestIdAttribute() {
  return getConfig().testIdAttribute
}

const queryByPlaceholderText = queryByAttribute.bind(null, 'placeholder')
const queryAllByPlaceholderText = queryAllByAttribute.bind(null, 'placeholder')
const queryByTestId = (...args) =>
  queryByAttribute(getTestIdAttribute(), ...args)
const queryAllByTestId = (...args) =>
  queryAllByAttribute(getTestIdAttribute(), ...args)
const queryByRole = queryByAttribute.bind(null, 'role')
const queryAllByRole = queryAllByAttribute.bind(null, 'role')

function queryAllByAltText(
  container,
  alt,
  {exact = true, collapseWhitespace, trim, normalizer} = {},
) {
  const matcher = exact ? matches : fuzzyMatches
  const matchNormalizer = makeNormalizer({collapseWhitespace, trim, normalizer})
  return Array.from(container.querySelectorAll('img,input,area')).filter(node =>
    matcher(node.getAttribute('alt'), node, alt, matchNormalizer),
  )
}

function queryByAltText(...args) {
  return firstResultOrNull(queryAllByAltText, ...args)
}

function queryAllByDisplayValue(
  container,
  value,
  {exact = true, collapseWhitespace, trim, normalizer} = {},
) {
  const matcher = exact ? matches : fuzzyMatches
  const matchNormalizer = makeNormalizer({collapseWhitespace, trim, normalizer})
  return Array.from(container.querySelectorAll(`input,textarea,select`)).filter(
    node => {
      if (node.tagName === 'SELECT') {
        const selectedOptions = Array.from(node.options).filter(
          option => option.selected,
        )
        return selectedOptions.some(optionNode =>
          matcher(getNodeText(optionNode), optionNode, value, matchNormalizer),
        )
      } else {
        return matcher(node.value, node, value, matchNormalizer)
      }
    },
  )
}

function queryByDisplayValue(...args) {
  return firstResultOrNull(queryAllByDisplayValue, ...args)
}

// getters
// the reason we're not dynamically generating these functions that look so similar:
// 1. The error messages are specific to each one and depend on arguments
// 2. The stack trace will look better because it'll have a helpful method name.

function getAllByTestId(container, id, ...rest) {
  const els = queryAllByTestId(container, id, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element by: [${getTestIdAttribute()}="${id}"]`,
      container,
    )
  }
  return els
}

function getByTestId(container, id, ...args) {
  const els = getAllByTestId(container, id, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements by: [${getTestIdAttribute()}="${id}"]`,
      container,
    )
  }
  return els[0]
}

function getAllByTitle(container, title, ...rest) {
  const els = queryAllByTitle(container, title, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element with the title: ${title}.`,
      container,
    )
  }
  return els
}

function getByTitle(container, title, ...args) {
  const els = getAllByTitle(container, title, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements with the title: ${title}.`,
      container,
    )
  }
  return els[0]
}

function getAllByPlaceholderText(container, text, ...rest) {
  const els = queryAllByPlaceholderText(container, text, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element with the placeholder text of: ${text}`,
      container,
    )
  }
  return els
}

function getByPlaceholderText(container, text, ...args) {
  const els = getAllByPlaceholderText(container, text, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements with the placeholder text of: ${text}`,
      container,
    )
  }
  return els[0]
}

function getAllByLabelText(container, text, ...rest) {
  const els = queryAllByLabelText(container, text, ...rest)
  if (!els.length) {
    const labels = queryAllLabelsByText(container, text, ...rest)
    if (labels.length) {
      throw getElementError(
        `Found a label with the text of: ${text}, however no form control was found associated to that label. Make sure you're using the "for" attribute or "aria-labelledby" attribute correctly.`,
        container,
      )
    } else {
      throw getElementError(
        `Unable to find a label with the text of: ${text}`,
        container,
      )
    }
  }
  return els
}

function getByLabelText(container, text, ...args) {
  const els = getAllByLabelText(container, text, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements with the text of: ${text}`,
      container,
    )
  }
  return els[0]
}

function getAllByText(container, text, ...rest) {
  const els = queryAllByText(container, text, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element with the text: ${text}. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`,
      container,
    )
  }
  return els
}

function getByText(container, text, ...args) {
  const els = getAllByText(container, text, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements with the text: ${text}`,
      container,
    )
  }
  return els[0]
}

function getAllByAltText(container, alt, ...rest) {
  const els = queryAllByAltText(container, alt, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element with the alt text: ${alt}`,
      container,
    )
  }
  return els
}

function getByAltText(container, alt, ...args) {
  const els = getAllByAltText(container, alt, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements with the alt text: ${alt}`,
      container,
    )
  }
  return els[0]
}

function getAllByRole(container, id, ...rest) {
  const els = queryAllByRole(container, id, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element by [role=${id}]`,
      container,
    )
  }
  return els
}

function getByRole(container, id, ...args) {
  const els = getAllByRole(container, id, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements by [role=${id}]`,
      container,
    )
  }
  return els[0]
}

function getAllByDisplayValue(container, value, ...rest) {
  const els = queryAllByDisplayValue(container, value, ...rest)
  if (!els.length) {
    throw getElementError(
      `Unable to find an element with the value: ${value}.`,
      container,
    )
  }
  return els
}

function getByDisplayValue(container, value, ...args) {
  const els = getAllByDisplayValue(container, value, ...args)
  if (els.length > 1) {
    throw getGetByElementError(
      `Found multiple elements with the value: ${value}.`,
      container,
    )
  }
  return els[0]
}

function makeFinder(getter) {
  return (container, text, options, waitForElementOptions) =>
    waitForElement(
      () => getter(container, text, options),
      waitForElementOptions,
    )
}

export const findByLabelText = makeFinder(getByLabelText)
export const findAllByLabelText = makeFinder(getAllByLabelText)

export const findByPlaceholderText = makeFinder(getByPlaceholderText)
export const findAllByPlaceholderText = makeFinder(getAllByPlaceholderText)

export const findByText = makeFinder(getByText)
export const findAllByText = makeFinder(getAllByText)

export const findByAltText = makeFinder(getByAltText)
export const findAllByAltText = makeFinder(getAllByAltText)

export const findByTitle = makeFinder(getByTitle)
export const findAllByTitle = makeFinder(getAllByTitle)

export const findByDisplayValue = makeFinder(getByDisplayValue)
export const findAllByDisplayValue = makeFinder(getAllByDisplayValue)

export const findByRole = makeFinder(getByRole)
export const findAllByRole = makeFinder(getAllByRole)

export const findByTestId = makeFinder(getByTestId)
export const findAllByTestId = makeFinder(getAllByTestId)

export {
  queryByPlaceholderText,
  queryAllByPlaceholderText,
  getByPlaceholderText,
  getAllByPlaceholderText,
  queryByText,
  queryAllByText,
  getByText,
  getAllByText,
  queryByLabelText,
  queryAllByLabelText,
  getByLabelText,
  getAllByLabelText,
  queryByAltText,
  queryAllByAltText,
  getByAltText,
  getAllByAltText,
  queryByTestId,
  queryAllByTestId,
  getByTestId,
  getAllByTestId,
  queryByTitle,
  queryAllByTitle,
  getByTitle,
  getAllByTitle,
  queryByDisplayValue,
  queryAllByDisplayValue,
  getByDisplayValue,
  getAllByDisplayValue,
  queryByRole,
  queryAllByRole,
  getAllByRole,
  getByRole,
}

/* eslint complexity:["error", 14] */
