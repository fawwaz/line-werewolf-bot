"use strict";

var Timeout = function () {
  var keyId = {};
  var complete = {};

  // set(key, func, ms) -- user-defined key
  // set(func, ms) -- func used as key
  //
  // returns a function allowing you to test if it has executed
  var set = function set() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var key = void 0,
        func = void 0,
        ms = void 0;

    if (args.length == 3) {
      ;
      key = args[0];
      func = args[1];
      ms = args[2];
    } else {
      func = args[0];
      ms = args[1];

      key = func;
    }

    clear(key);

    var invoke = function invoke() {
      return complete[key] = true, func();
    };

    keyId[key] = setTimeout(invoke, ms);
    complete[key] = false;

    return function () {
      return executed(key);
    };
  };

  var clear = function clear(key) {
    clearTimeout(keyId[key]);
    delete keyId[key];
    delete complete[key];
  };

  // timeout has been created
  var exists = function exists(key) {
    return key in keyId;
  };

  // timeout does exist, but has not yet run
  var pending = function pending(key) {
    return exists(key) && !executed(key

    // test if a timeout has run
    );
  };var executed = function executed(key) {
    return key in complete && complete[key];
  };

  return {
    set: set,
    clear: clear,
    exists: exists,
    pending: pending,
    executed: executed
  };
}();

module.exports = Timeout;