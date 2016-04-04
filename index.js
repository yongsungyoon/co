
/**
 * slice() reference.
 */

var slice = Array.prototype.slice;

/**
 * Expose `co`.
 */

// 모듈을 ES6에서도 사용할 수 있게 exports 한다.
// 아래와 같이 두가지 방법 모두 사용이 가능할 것이다. 
// import co form 'co';
// import {co} from 'co';
module.exports = co['default'] = co.co = co;

/**
 * Wrap the given generator `fn` into a
 * function that returns a promise.
 * This is a separate function so that
 * every `co()` call doesn't create a new,
 * unnecessary closure.
 *
 * @param {GeneratorFunction} fn
 * @return {Function}
 * @api public
 */
// co를 직접 호출하면, Promise를 생성해서 반환하는데 주어진 Generator/Generator Function은
// 이미 실행된(실행되고 있는) 상태일 것이다.
// co.wrap은 Promise를 생성하는 함수를 반환하기 때문에 이 함수를 추후 호출하는 시점에 Promise
// 가 생성될 것이고 또한 실행도 이순간 일어날 것이다.
co.wrap = function (fn) {
  createPromise.__generatorFunction__ = fn;
  return createPromise;
  function createPromise() {
    return co.call(this, fn.apply(this, arguments));
  }
};

/**
 * Execute the generator function or a generator
 * and return a promise.
 *
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */

// gen에는 generator나 generator function이 들어올 수 있다.
function co(gen) {
  // co를 호출한 context를 보관해놓았다가, 나중에 param으로 넘겨진 fn을 호출할때도, context로
  // 그대로 사용한다.
  var ctx = this;
  // arguments를 args라는 array로 만들기. gen을 제외한 1번째 parameter를 array로 만든다.
  var args = slice.call(arguments, 1);

  // we wrap everything in a promise to avoid promise chaining,
  // which leads to memory leak errors.
  // see https://github.com/tj/co/issues/180
  return new Promise(function(resolve, reject) {
    // gen가 function이면 ctx, args를 갖고 해당 함수를 호출.
    // gen이 generator function인 경우 여기에 해당되며, generator funciton을 주어진
    // arguments와 호출하므로, gen에는 generator가 assign된다.
    if (typeof gen === 'function') gen = gen.apply(ctx, args);

    // gen이 falsy하거나 , gen.next가 function이 아니면 (즉, generator가 아니면)
    // resolve(gen)을 호출해서 promise 종료. 즉 잘못된 호출일 것이다.
    if (!gen || typeof gen.next !== 'function') return resolve(gen);

    // 이제 여기서부터 gen은 generator이다.
    // 아래 onFulfilled 함수는 원래 Promise의 then에 사용될 함수이며, generator의 첫 실행을 위해서
    // 직접 호출한다. generator의 최초의 호출시 next()에 파라매터를 넘길 수 없드시 여기서도
    // 파래매터가 없다.
    onFulfilled();

    /**
     * @param {Mixed} res
     * @return {Promise}
     * @api private
     */
    // generator를 한번 실행하고, next에서 반환된 것을 처리한다.
    // 파라매터로 주어진 res는 next를 통해서 yield로 전달.
    // 즉, 최초 실행시에는 없지만 직접 호출하여 res가 없지만,
    // 두번째 실행부터 Promise의 then에서 넘겨져서 호출되므로,
    // 그전 yieldable의 실행 결과를 파라매터로 받게됨.
    // 이 값을 next 호출시 넘겨줌으로써, yieldable의 결과값을 yield 구문의 반환값으로 전달할 수 있도록
    // 한다.
    function onFulfilled(res) {
      var ret;
      try {
        ret = gen.next(res);
      } catch (e) {
        // generator에서 Error가 throw되었다면 여기서 Promise중단.
        return reject(e);
      }
      next(ret);
      return null;
    }

    /**
     * @param {Error} err
     * @return {Promise}
     * @api private
     */
    // Promise가 reject된 경우이므로, generator에게 에러를 알려준다.
    function onRejected(err) {
      var ret;
      try {
        ret = gen.throw(err);
      } catch (e) {
        // Error가 여기로 전달되었다는건, generator가 에러를 catch하지 않았다는것.
        // 따라서 이 Generator는 실행이 불가능하다. reject를 호춣하여 Promise를 종료한다.
        return reject(e);
      }
      next(ret);
    }

    /**
     * Get the next value in the generator,
     * return a promise.
     *
     * @param {Object} ret
     * @return {Promise}
     * @api private
     */
    // ret는 generator.next()의 결과 값으로서
    // ret.done이 true 즉 iterator가 종료되었으면, 현재 이 Promise를 종료하면서, ret.value를 넘긴다.
    // 아직 종료되지 않은 경우는 yield 구문을 통해서 yiedable이 넘어왔을 것이므로
    // toPromise 함수를 통해서 yiedable을 Promise로 변환하고 각 성공과 실패시에
    // onFullfilled, onRejected를 호출하게 해둔다.
    // onFullfilled에서는 위에서 본 바와같이 generator.next()를 통해 다음 yield 구문까지
    // 실행한다.
    function next(ret) {
      if (ret.done) return resolve(ret.value);
      // yield를 통해 넘어온 값을 Promise로 변환
      var value = toPromise.call(ctx, ret.value);
      // Promise로 변환 성공한 경우는, promise에 then을 통해 결과를 처리.
      if (value && isPromise(value)) return value.then(onFulfilled, onRejected);
      // Promise로 변환에 실패한 경우. 즉 yieldable이 아닌 것이 반환 된 경우.
      return onRejected(new TypeError('You may only yield a function, promise, generator, array, or object, '
        + 'but the following object was passed: "' + String(ret.value) + '"'));
    }
  });
}

/**
 * Convert a `yield`ed value into a promise.
 *
 * @param {Mixed} obj
 * @return {Promise}
 * @api private
 */
// yield 구문을 통해 넘어온 obj (yielded value)를 Promise로 변환
function toPromise(obj) {
  if (!obj) return obj;
  // 이미 Promise 객체가 넘어왔다면 그냥 반환
  if (isPromise(obj)) return obj;
  // Generator였거나 Generator Function이었다면, 재귀적으로 co를 다시 호출
  // 위에서 본 것과 같이 co는 generator / generator function을 모두 Promise로 만들어 줄 수 있다.
  if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);
  // generator function이 아닌 일반 함수였다면 thunk로 가정하고
  // thunk를 Promise로 변경해서 반환.
  if ('function' == typeof obj) return thunkToPromise.call(this, obj);
  // Array속의 모든 yiedable들을 각각 Promise로 반들고 전체를 하나의 Promise로 만들어서 반환.
  if (Array.isArray(obj)) return arrayToPromise.call(this, obj);
  // Object이라면 objectToPromise 호출을 통해서 Object의 각 value들에 들어있는
  // yiedable들을 그것의 결과가 들어있는 객체를 반환하는 Promise로 변환.
  if (isObject(obj)) return objectToPromise.call(this, obj);
  // 여기로 온경우는 yiedable이 아닌 경우. 그냥 반환.
  return obj;
}

/**
 * Convert a thunk to a promise.
 *
 * @param {Function}
 * @return {Promise}
 * @api private
 */
// fn은 thunk이다. Thunk를 Promise로 변환해서 반환.
// Promise를 생성해서 반환하는데, 생성된 Promise는
// thunk를 호출하고, callback에서 실패시 reject,
// 성공시 resolve를 하는 단순 Promise.
function thunkToPromise(fn) {
  var ctx = this;
  return new Promise(function (resolve, reject) {
    fn.call(ctx, function (err, res) {
      if (err) return reject(err);
      // arguments가 3개 이상이므로 res말고도 뒤에 응답이 더 있다.
      // array로 만들어서 resolve 호출
      // res만 전달된 경우는 그냥 그대로 resolve 호출
      if (arguments.length > 2) res = slice.call(arguments, 1);
      resolve(res);
    });
  });
}

/**
 * Convert an array of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Array} obj
 * @return {Promise}
 * @api private
 */
// Array가 주어졌다면 Array 모든 element들에 대해서 toPromise함수 호출을 통해서
// 모두 Promise로 만들고, 이 Promise들을 Promise.all로 하나로 묶어서 반환
function arrayToPromise(obj) {
  return Promise.all(obj.map(toPromise, this));
}

/**
 * Convert an object of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Object} obj
 * @return {Promise}
 * @api private
 */
// obj안에는 다양한 yieldable들이 value로 들어있다.
// 이 yieldable들을 promise로 바꾸어서 동일한 형태의 object에 value로 담에서 반환하는 promise 반환한다.
// 즉 반환되는 promise가 종료되면 반환되는 객체는 object의 각 value부분이 yieldable의 결과로
// 채워있는 object이다.
function objectToPromise(obj){
  // 주어진 obj 생성자를 이용해서 동일한 형태의 빈 object을 만든다
  var results = new obj.constructor();
  var keys = Object.keys(obj);
  var promises = [];

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    // object의 각 key의 value에 들어있는 yieldable을 promise로 변환.
    var promise = toPromise.call(this, obj[key]);
    // Promise가 반환되었다면 defer를 호출하여 결과도 모으고, 이 promise자체도 모아둔다.
    if (promise && isPromise(promise)) defer(promise, key);
    // Promise로 변환이 안되었다는건 yiedable이 아니다. 그냥 값을 복사해 넣는다.
    else results[key] = obj[key];
  }
  // promises배열에 모은 모든 promises가 종료되면, results에 결과도 모였을테고, 그것을
  // 반환하는 promise를 반환한다. then을 통해서 이 Promise가 단지 promise 결과의 array가
  // 반환되지 않고 results 객체를 반환하도록 한다.
  return Promise.all(promises).then(function () {
    return results;
  });

  // 주어진 promise가 완료시 results의 주어진 key에 그 결과를 넣도록 하고,
  // 주어진 promise 자체도 promises 배열어 넣어서 모아둔다.
  function defer(promise, key) {
    // predefine the key in the result
    results[key] = undefined;
    promises.push(promise.then(function (res) {
      results[key] = res;
    }));
  }
}

/**
 * Check if `obj` is a promise.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isPromise(obj) {
  return 'function' == typeof obj.then;
}

/**
 * Check if `obj` is a generator.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

function isGenerator(obj) {
  return 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
 * Check if `obj` is a generator function.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */
function isGeneratorFunction(obj) {
  var constructor = obj.constructor;
  if (!constructor) return false;
  if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
  return isGenerator(constructor.prototype);
}

/**
 * Check for plain object.
 *
 * @param {Mixed} val
 * @return {Boolean}
 * @api private
 */

function isObject(val) {
  return Object == val.constructor;
}
