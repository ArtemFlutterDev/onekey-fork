/* eslint-disable unicorn/prefer-global-this */
// react-native-crypto
//      react-native-quick-crypto
// react-native-get-random-values
//      (react-native-crypto depend on) react-native-randombytes (deprecated)
console.log('================ cross-crypto (native)');

if (global.crypto && global.crypto.getRandomValues) {
  delete global.crypto.getRandomValues;
}
// shim global.crypto.getRandomValues
require('react-native-get-random-values');

if (process.env.NODE_ENV !== 'production') {
  const getRandomValuesOld = global.crypto.getRandomValues;
  global.crypto.getRandomValues = function (...args) {
    // - sentry component uuid
    // - encodeSensitiveText
    console.log(
      '-------- call global.crypto.getRandomValues (native)',
      getRandomValuesOld,
    );
    // console.trace('global.crypto.getRandomValues (native)');
    return getRandomValuesOld.apply(global.crypto, args);
  };
}

const crypto = require('react-native-crypto');

const { randomBytes } = require('@noble/hashes/utils');

// re-assign randomBytes from global.crypto.getRandomValues
crypto.randomBytes = randomBytes;
crypto.getRandomValues =
  crypto.getRandomValues || global.crypto.getRandomValues;
global.crypto.randomBytes = global.crypto.randomBytes || crypto.randomBytes;

crypto.$$isOneKeyShim = true;
global.crypto.$$isOneKeyShim = true;

if (process.env.NODE_ENV !== 'production') {
  console.log('react-native-crypto polyfilled', crypto, global.crypto);
}

module.exports = crypto;
