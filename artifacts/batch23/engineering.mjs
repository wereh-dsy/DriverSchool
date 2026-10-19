// artifacts/batch23/engineering.ts
import { readFileSync, writeFileSync, renameSync } from "node:fs";

// src/world/city/CityMapData.ts
var PREFAB_IDS = ["residential_low", "residential_mid", "office", "commercial", "industrial", "school", "garage", "parking", "tree", "streetlight", "traffic_sign", "bus_stop", "guardrail", "parked_car", "noise_barrier", "green_strip", "hardscape", "embankment", "guide_sign", "water", "sports_field", "streetlight_dual", "streetlight_highway", "streetlight_small", "waterway", "railway_track", "station_platform", "stadium"];
var ROAD_LANES = { urban_2lane: 2, urban_4lane: 4, urban_6lane: 6, highway: 6, ramp_1: 1 };
var INTERSECTION_LANES = { t_2lane: 2, t_4lane: 4, cross_4lane: 4, cross_6lane: 6, irregular: 6, divided_cross: 6 };
function newCityMap() {
  return {
    schemaVersion: 2,
    id: "new-city",
    name: "New City",
    version: 1,
    sectorSize: 500,
    roadLinks: [],
    connectionPorts: [],
    bounds: { minX: -1e3, maxX: 1e3, minZ: -1e3, maxZ: 1e3 },
    roads: [],
    intersections: [],
    objects: [],
    environment: { districts: [], spawnPoints: [{ id: "start", position: { x: 0, y: 0, z: 0 }, rotation: 0 }] }
  };
}

// node_modules/.pnpm/three@0.180.0/node_modules/three/build/three.core.js
var REVISION = "180";
var NeverDepth = 0;
var AlwaysDepth = 1;
var LessDepth = 2;
var LessEqualDepth = 3;
var EqualDepth = 4;
var GreaterEqualDepth = 5;
var GreaterDepth = 6;
var NotEqualDepth = 7;
var UVMapping = 300;
var RepeatWrapping = 1e3;
var ClampToEdgeWrapping = 1001;
var MirroredRepeatWrapping = 1002;
var LinearFilter = 1006;
var LinearMipmapLinearFilter = 1008;
var UnsignedByteType = 1009;
var RGBAFormat = 1023;
var InterpolateDiscrete = 2300;
var InterpolateLinear = 2301;
var InterpolateSmooth = 2302;
var ZeroCurvatureEnding = 2400;
var ZeroSlopeEnding = 2401;
var WrapAroundEnding = 2402;
var NoColorSpace = "";
var SRGBColorSpace = "srgb";
var LinearSRGBColorSpace = "srgb-linear";
var LinearTransfer = "linear";
var SRGBTransfer = "srgb";
var WebGLCoordinateSystem = 2e3;
var WebGPUCoordinateSystem = 2001;
var EventDispatcher = class {
  /**
   * Adds the given event listener to the given event type.
   *
   * @param {string} type - The type of event to listen to.
   * @param {Function} listener - The function that gets called when the event is fired.
   */
  addEventListener(type, listener) {
    if (this._listeners === void 0) this._listeners = {};
    const listeners = this._listeners;
    if (listeners[type] === void 0) {
      listeners[type] = [];
    }
    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }
  }
  /**
   * Returns `true` if the given event listener has been added to the given event type.
   *
   * @param {string} type - The type of event.
   * @param {Function} listener - The listener to check.
   * @return {boolean} Whether the given event listener has been added to the given event type.
   */
  hasEventListener(type, listener) {
    const listeners = this._listeners;
    if (listeners === void 0) return false;
    return listeners[type] !== void 0 && listeners[type].indexOf(listener) !== -1;
  }
  /**
   * Removes the given event listener from the given event type.
   *
   * @param {string} type - The type of event.
   * @param {Function} listener - The listener to remove.
   */
  removeEventListener(type, listener) {
    const listeners = this._listeners;
    if (listeners === void 0) return;
    const listenerArray = listeners[type];
    if (listenerArray !== void 0) {
      const index = listenerArray.indexOf(listener);
      if (index !== -1) {
        listenerArray.splice(index, 1);
      }
    }
  }
  /**
   * Dispatches an event object.
   *
   * @param {Object} event - The event that gets fired.
   */
  dispatchEvent(event) {
    const listeners = this._listeners;
    if (listeners === void 0) return;
    const listenerArray = listeners[event.type];
    if (listenerArray !== void 0) {
      event.target = this;
      const array = listenerArray.slice(0);
      for (let i = 0, l = array.length; i < l; i++) {
        array[i].call(this, event);
      }
      event.target = null;
    }
  }
};
var _lut = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "1a", "1b", "1c", "1d", "1e", "1f", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "3a", "3b", "3c", "3d", "3e", "3f", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "4a", "4b", "4c", "4d", "4e", "4f", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "5a", "5b", "5c", "5d", "5e", "5f", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "6a", "6b", "6c", "6d", "6e", "6f", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "7a", "7b", "7c", "7d", "7e", "7f", "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "8a", "8b", "8c", "8d", "8e", "8f", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "9a", "9b", "9c", "9d", "9e", "9f", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "aa", "ab", "ac", "ad", "ae", "af", "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "ba", "bb", "bc", "bd", "be", "bf", "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "ca", "cb", "cc", "cd", "ce", "cf", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "da", "db", "dc", "dd", "de", "df", "e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "ea", "eb", "ec", "ed", "ee", "ef", "f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "fa", "fb", "fc", "fd", "fe", "ff"];
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 180 / Math.PI;
function generateUUID() {
  const d0 = Math.random() * 4294967295 | 0;
  const d1 = Math.random() * 4294967295 | 0;
  const d2 = Math.random() * 4294967295 | 0;
  const d3 = Math.random() * 4294967295 | 0;
  const uuid = _lut[d0 & 255] + _lut[d0 >> 8 & 255] + _lut[d0 >> 16 & 255] + _lut[d0 >> 24 & 255] + "-" + _lut[d1 & 255] + _lut[d1 >> 8 & 255] + "-" + _lut[d1 >> 16 & 15 | 64] + _lut[d1 >> 24 & 255] + "-" + _lut[d2 & 63 | 128] + _lut[d2 >> 8 & 255] + "-" + _lut[d2 >> 16 & 255] + _lut[d2 >> 24 & 255] + _lut[d3 & 255] + _lut[d3 >> 8 & 255] + _lut[d3 >> 16 & 255] + _lut[d3 >> 24 & 255];
  return uuid.toLowerCase();
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function euclideanModulo(n, m) {
  return (n % m + m) % m;
}
function lerp(x, y, t) {
  return (1 - t) * x + t * y;
}
var Vector2 = class _Vector2 {
  /**
   * Constructs a new 2D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   */
  constructor(x = 0, y = 0) {
    _Vector2.prototype.isVector2 = true;
    this.x = x;
    this.y = y;
  }
  /**
   * Alias for {@link Vector2#x}.
   *
   * @type {number}
   */
  get width() {
    return this.x;
  }
  set width(value) {
    this.x = value;
  }
  /**
   * Alias for {@link Vector2#y}.
   *
   * @type {number}
   */
  get height() {
    return this.y;
  }
  set height(value) {
    this.y = value;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @return {Vector2} A reference to this vector.
   */
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector2} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y.
   * @param {number} value - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y.
   * @return {number} A vector component value.
   */
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector2} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector2} v - The vector to copy.
   * @return {Vector2} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector2} v - The vector to add.
   * @return {Vector2} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector2} A reference to this vector.
   */
  addScalar(s) {
    this.x += s;
    this.y += s;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector2} a - The first vector.
   * @param {Vector2} b - The second vector.
   * @return {Vector2} A reference to this vector.
   */
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector2} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector2} A reference to this vector.
   */
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector2} v - The vector to subtract.
   * @return {Vector2} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector2} A reference to this vector.
   */
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector2} a - The first vector.
   * @param {Vector2} b - The second vector.
   * @return {Vector2} A reference to this vector.
   */
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector2} v - The vector to multiply.
   * @return {Vector2} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector2} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector2} v - The vector to divide.
   * @return {Vector2} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector2} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * Multiplies this vector (with an implicit 1 as the 3rd component) by
   * the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to apply.
   * @return {Vector2} A reference to this vector.
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6];
    this.y = e[1] * x + e[4] * y + e[7];
    return this;
  }
  /**
   * If this vector's x or y value is greater than the given vector's x or y
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector2} v - The vector.
   * @return {Vector2} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    return this;
  }
  /**
   * If this vector's x or y value is less than the given vector's x or y
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector2} v - The vector.
   * @return {Vector2} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    return this;
  }
  /**
   * If this vector's x or y value is greater than the max vector's x or y
   * value, it is replaced by the corresponding value.
   * If this vector's x or y value is less than the min vector's x or y value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector2} min - The minimum x and y values.
   * @param {Vector2} max - The maximum x and y values in the desired range.
   * @return {Vector2} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    return this;
  }
  /**
   * If this vector's x or y values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x or y values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector2} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector2} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector2} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x and y = -y.
   *
   * @return {Vector2} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector2} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
  /**
   * Calculates the cross product of the given vector with this instance.
   *
   * @param {Vector2} v - The vector to compute the cross product with.
   * @return {number} The result of the cross product.
   */
  cross(v) {
    return this.x * v.y - this.y * v.x;
  }
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0) to (x, y). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0) to (x, y).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector2} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Computes the angle in radians of this vector with respect to the positive x-axis.
   *
   * @return {number} The angle in radians.
   */
  angle() {
    const angle = Math.atan2(-this.y, -this.x) + Math.PI;
    return angle;
  }
  /**
   * Returns the angle between the given vector and this instance in radians.
   *
   * @param {Vector2} v - The vector to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  /**
   * Computes the distance from the given vector to this instance.
   *
   * @param {Vector2} v - The vector to compute the distance to.
   * @return {number} The distance.
   */
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  /**
   * Computes the squared distance from the given vector to this instance.
   * If you are just comparing the distance with another distance, you should compare
   * the distance squared instead as it is slightly more efficient to calculate.
   *
   * @param {Vector2} v - The vector to compute the squared distance to.
   * @return {number} The squared distance.
   */
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y;
    return dx * dx + dy * dy;
  }
  /**
   * Computes the Manhattan distance from the given vector to this instance.
   *
   * @param {Vector2} v - The vector to compute the Manhattan distance to.
   * @return {number} The Manhattan distance.
   */
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector2} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector2} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector2} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector2} v1 - The first vector.
   * @param {Vector2} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector2} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector2} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]` and y
   * value to be `array[ offset + 1 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector2} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector2} A reference to this vector.
   */
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    return this;
  }
  /**
   * Rotates this vector around the given center by the given angle.
   *
   * @param {Vector2} center - The point around which to rotate.
   * @param {number} angle - The angle to rotate, in radians.
   * @return {Vector2} A reference to this vector.
   */
  rotateAround(center, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = this.x - center.x;
    const y = this.y - center.y;
    this.x = x * c - y * s + center.x;
    this.y = x * s + y * c + center.y;
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector2} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }
};
var Quaternion = class {
  /**
   * Constructs a new quaternion.
   *
   * @param {number} [x=0] - The x value of this quaternion.
   * @param {number} [y=0] - The y value of this quaternion.
   * @param {number} [z=0] - The z value of this quaternion.
   * @param {number} [w=1] - The w value of this quaternion.
   */
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.isQuaternion = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }
  /**
   * Interpolates between two quaternions via SLERP. This implementation assumes the
   * quaternion data are managed  in flat arrays.
   *
   * @param {Array<number>} dst - The destination array.
   * @param {number} dstOffset - An offset into the destination array.
   * @param {Array<number>} src0 - The source array of the first quaternion.
   * @param {number} srcOffset0 - An offset into the first source array.
   * @param {Array<number>} src1 -  The source array of the second quaternion.
   * @param {number} srcOffset1 - An offset into the second source array.
   * @param {number} t - The interpolation factor in the range `[0,1]`.
   * @see {@link Quaternion#slerp}
   */
  static slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t) {
    let x0 = src0[srcOffset0 + 0], y0 = src0[srcOffset0 + 1], z0 = src0[srcOffset0 + 2], w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1 + 0], y1 = src1[srcOffset1 + 1], z1 = src1[srcOffset1 + 2], w1 = src1[srcOffset1 + 3];
    if (t === 0) {
      dst[dstOffset + 0] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
      return;
    }
    if (t === 1) {
      dst[dstOffset + 0] = x1;
      dst[dstOffset + 1] = y1;
      dst[dstOffset + 2] = z1;
      dst[dstOffset + 3] = w1;
      return;
    }
    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let s = 1 - t;
      const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1, dir2 = cos >= 0 ? 1 : -1, sqrSin = 1 - cos * cos;
      if (sqrSin > Number.EPSILON) {
        const sin = Math.sqrt(sqrSin), len = Math.atan2(sin, cos * dir2);
        s = Math.sin(s * len) / sin;
        t = Math.sin(t * len) / sin;
      }
      const tDir = t * dir2;
      x0 = x0 * s + x1 * tDir;
      y0 = y0 * s + y1 * tDir;
      z0 = z0 * s + z1 * tDir;
      w0 = w0 * s + w1 * tDir;
      if (s === 1 - t) {
        const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
        x0 *= f;
        y0 *= f;
        z0 *= f;
        w0 *= f;
      }
    }
    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }
  /**
   * Multiplies two quaternions. This implementation assumes the quaternion data are managed
   * in flat arrays.
   *
   * @param {Array<number>} dst - The destination array.
   * @param {number} dstOffset - An offset into the destination array.
   * @param {Array<number>} src0 - The source array of the first quaternion.
   * @param {number} srcOffset0 - An offset into the first source array.
   * @param {Array<number>} src1 -  The source array of the second quaternion.
   * @param {number} srcOffset1 - An offset into the second source array.
   * @return {Array<number>} The destination array.
   * @see {@link Quaternion#multiplyQuaternions}.
   */
  static multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
    const x0 = src0[srcOffset0];
    const y0 = src0[srcOffset0 + 1];
    const z0 = src0[srcOffset0 + 2];
    const w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1];
    const y1 = src1[srcOffset1 + 1];
    const z1 = src1[srcOffset1 + 2];
    const w1 = src1[srcOffset1 + 3];
    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
    return dst;
  }
  /**
   * The x value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  /**
   * The y value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  /**
   * The z value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  /**
   * The w value of this quaternion.
   *
   * @type {number}
   * @default 1
   */
  get w() {
    return this._w;
  }
  set w(value) {
    this._w = value;
    this._onChangeCallback();
  }
  /**
   * Sets the quaternion components.
   *
   * @param {number} x - The x value of this quaternion.
   * @param {number} y - The y value of this quaternion.
   * @param {number} z - The z value of this quaternion.
   * @param {number} w - The w value of this quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  set(x, y, z, w) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback();
    return this;
  }
  /**
   * Returns a new quaternion with copied values from this instance.
   *
   * @return {Quaternion} A clone of this instance.
   */
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._w);
  }
  /**
   * Copies the values of the given quaternion to this instance.
   *
   * @param {Quaternion} quaternion - The quaternion to copy.
   * @return {Quaternion} A reference to this quaternion.
   */
  copy(quaternion) {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the rotation specified by the given
   * Euler angles.
   *
   * @param {Euler} euler - The Euler angles.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromEuler(euler, update = true) {
    const x = euler._x, y = euler._y, z = euler._z, order = euler._order;
    const cos = Math.cos;
    const sin = Math.sin;
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);
    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);
    switch (order) {
      case "XYZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "YXZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "ZXY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "ZYX":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "YZX":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "XZY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      default:
        console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: " + order);
    }
    if (update === true) this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the given axis and angle.
   *
   * @param {Vector3} axis - The normalized axis.
   * @param {number} angle - The angle in radians.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2, s = Math.sin(halfAngle);
    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Math.cos(halfAngle);
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the given rotation matrix.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromRotationMatrix(m) {
    const te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10], trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion to the rotation required to rotate the direction vector
   * `vFrom` to the direction vector `vTo`.
   *
   * @param {Vector3} vFrom - The first (normalized) direction vector.
   * @param {Vector3} vTo - The second (normalized) direction vector.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromUnitVectors(vFrom, vTo) {
    let r = vFrom.dot(vTo) + 1;
    if (r < 1e-8) {
      r = 0;
      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r;
      }
    } else {
      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r;
    }
    return this.normalize();
  }
  /**
   * Returns the angle between this quaternion and the given one in radians.
   *
   * @param {Quaternion} q - The quaternion to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(q) {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }
  /**
   * Rotates this quaternion by a given angular step to the given quaternion.
   * The method ensures that the final quaternion will not overshoot `q`.
   *
   * @param {Quaternion} q - The target quaternion.
   * @param {number} step - The angular step in radians.
   * @return {Quaternion} A reference to this quaternion.
   */
  rotateTowards(q, step) {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    const t = Math.min(1, step / angle);
    this.slerp(q, t);
    return this;
  }
  /**
   * Sets this quaternion to the identity quaternion; that is, to the
   * quaternion that represents "no rotation".
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  identity() {
    return this.set(0, 0, 0, 1);
  }
  /**
   * Inverts this quaternion via {@link Quaternion#conjugate}. The
   * quaternion is assumed to have unit length.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  invert() {
    return this.conjugate();
  }
  /**
   * Returns the rotational conjugate of this quaternion. The conjugate of a
   * quaternion represents the same rotation in the opposite direction about
   * the rotational axis.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  conjugate() {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._onChangeCallback();
    return this;
  }
  /**
   * Calculates the dot product of this quaternion and the given one.
   *
   * @param {Quaternion} v - The quaternion to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
  }
  /**
   * Computes the squared Euclidean length (straight-line length) of this quaternion,
   * considered as a 4 dimensional vector. This can be useful if you are comparing the
   * lengths of two quaternions, as this is a slightly more efficient calculation than
   * {@link Quaternion#length}.
   *
   * @return {number} The squared Euclidean length.
   */
  lengthSq() {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }
  /**
   * Computes the Euclidean length (straight-line length) of this quaternion,
   * considered as a 4 dimensional vector.
   *
   * @return {number} The Euclidean length.
   */
  length() {
    return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }
  /**
   * Normalizes this quaternion - that is, calculated the quaternion that performs
   * the same rotation as this one, but has a length equal to `1`.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  normalize() {
    let l = this.length();
    if (l === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l = 1 / l;
      this._x = this._x * l;
      this._y = this._y * l;
      this._z = this._z * l;
      this._w = this._w * l;
    }
    this._onChangeCallback();
    return this;
  }
  /**
   * Multiplies this quaternion by the given one.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }
  /**
   * Pre-multiplies this quaternion by the given one.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  premultiply(q) {
    return this.multiplyQuaternions(q, this);
  }
  /**
   * Multiplies the given quaternions and stores the result in this instance.
   *
   * @param {Quaternion} a - The first quaternion.
   * @param {Quaternion} b - The second quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  multiplyQuaternions(a, b) {
    const qax = a._x, qay = a._y, qaz = a._z, qaw = a._w;
    const qbx = b._x, qby = b._y, qbz = b._z, qbw = b._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this._onChangeCallback();
    return this;
  }
  /**
   * Performs a spherical linear interpolation between quaternions.
   *
   * @param {Quaternion} qb - The target quaternion.
   * @param {number} t - The interpolation factor in the closed interval `[0, 1]`.
   * @return {Quaternion} A reference to this quaternion.
   */
  slerp(qb, t) {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this._x, y = this._y, z = this._z, w = this._w;
    let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;
    if (cosHalfTheta < 0) {
      this._w = -qb._w;
      this._x = -qb._x;
      this._y = -qb._y;
      this._z = -qb._z;
      cosHalfTheta = -cosHalfTheta;
    } else {
      this.copy(qb);
    }
    if (cosHalfTheta >= 1) {
      this._w = w;
      this._x = x;
      this._y = y;
      this._z = z;
      return this;
    }
    const sqrSinHalfTheta = 1 - cosHalfTheta * cosHalfTheta;
    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1 - t;
      this._w = s * w + t * this._w;
      this._x = s * x + t * this._x;
      this._y = s * y + t * this._y;
      this._z = s * z + t * this._z;
      this.normalize();
      return this;
    }
    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta, ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    this._w = w * ratioA + this._w * ratioB;
    this._x = x * ratioA + this._x * ratioB;
    this._y = y * ratioA + this._y * ratioB;
    this._z = z * ratioA + this._z * ratioB;
    this._onChangeCallback();
    return this;
  }
  /**
   * Performs a spherical linear interpolation between the given quaternions
   * and stores the result in this quaternion.
   *
   * @param {Quaternion} qa - The source quaternion.
   * @param {Quaternion} qb - The target quaternion.
   * @param {number} t - The interpolation factor in the closed interval `[0, 1]`.
   * @return {Quaternion} A reference to this quaternion.
   */
  slerpQuaternions(qa, qb, t) {
    return this.copy(qa).slerp(qb, t);
  }
  /**
   * Sets this quaternion to a uniformly random, normalized quaternion.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  random() {
    const theta1 = 2 * Math.PI * Math.random();
    const theta2 = 2 * Math.PI * Math.random();
    const x0 = Math.random();
    const r1 = Math.sqrt(1 - x0);
    const r2 = Math.sqrt(x0);
    return this.set(
      r1 * Math.sin(theta1),
      r1 * Math.cos(theta1),
      r2 * Math.sin(theta2),
      r2 * Math.cos(theta2)
    );
  }
  /**
   * Returns `true` if this quaternion is equal with the given one.
   *
   * @param {Quaternion} quaternion - The quaternion to test for equality.
   * @return {boolean} Whether this quaternion is equal with the given one.
   */
  equals(quaternion) {
    return quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w;
  }
  /**
   * Sets this quaternion's components from the given array.
   *
   * @param {Array<number>} array - An array holding the quaternion component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Quaternion} A reference to this quaternion.
   */
  fromArray(array, offset = 0) {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this._onChangeCallback();
    return this;
  }
  /**
   * Writes the components of this quaternion to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the quaternion components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The quaternion components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  }
  /**
   * Sets the components of this quaternion from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding quaternion data.
   * @param {number} index - The index into the attribute.
   * @return {Quaternion} A reference to this quaternion.
   */
  fromBufferAttribute(attribute, index) {
    this._x = attribute.getX(index);
    this._y = attribute.getY(index);
    this._z = attribute.getZ(index);
    this._w = attribute.getW(index);
    this._onChangeCallback();
    return this;
  }
  /**
   * This methods defines the serialization result of this class. Returns the
   * numerical elements of this quaternion in an array of format `[x, y, z, w]`.
   *
   * @return {Array<number>} The serialized quaternion.
   */
  toJSON() {
    return this.toArray();
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._w;
  }
};
var Vector3 = class _Vector3 {
  /**
   * Constructs a new 3D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   * @param {number} [z=0] - The z value of this vector.
   */
  constructor(x = 0, y = 0, z = 0) {
    _Vector3.prototype.isVector3 = true;
    this.x = x;
    this.y = y;
    this.z = z;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @param {number} z - The value of the z component.
   * @return {Vector3} A reference to this vector.
   */
  set(x, y, z) {
    if (z === void 0) z = this.z;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector3} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Sets the vector's z component to the given value
   *
   * @param {number} z - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setZ(z) {
    this.z = z;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y, `2` equals to z.
   * @param {number} value - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y, `2` equals to z.
   * @return {number} A vector component value.
   */
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector3} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y, this.z);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector3} v - The vector to copy.
   * @return {Vector3} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector3} v - The vector to add.
   * @return {Vector3} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector3} A reference to this vector.
   */
  addScalar(s) {
    this.x += s;
    this.y += s;
    this.z += s;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector3|Vector4} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector3} A reference to this vector.
   */
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector3} v - The vector to subtract.
   * @return {Vector3} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector3} A reference to this vector.
   */
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector3} v - The vector to multiply.
   * @return {Vector3} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector3} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }
  /**
   * Multiplies the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  multiplyVectors(a, b) {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  }
  /**
   * Applies the given Euler rotation to this vector.
   *
   * @param {Euler} euler - The Euler angles.
   * @return {Vector3} A reference to this vector.
   */
  applyEuler(euler) {
    return this.applyQuaternion(_quaternion$4.setFromEuler(euler));
  }
  /**
   * Applies a rotation specified by an axis and an angle to this vector.
   *
   * @param {Vector3} axis - A normalized vector representing the rotation axis.
   * @param {number} angle - The angle in radians.
   * @return {Vector3} A reference to this vector.
   */
  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(_quaternion$4.setFromAxisAngle(axis, angle));
  }
  /**
   * Multiplies this vector with the given 3x3 matrix.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @return {Vector3} A reference to this vector.
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }
  /**
   * Multiplies this vector by the given normal matrix and normalizes
   * the result.
   *
   * @param {Matrix3} m - The normal matrix.
   * @return {Vector3} A reference to this vector.
   */
  applyNormalMatrix(m) {
    return this.applyMatrix3(m).normalize();
  }
  /**
   * Multiplies this vector (with an implicit 1 in the 4th dimension) by m, and
   * divides by perspective.
   *
   * @param {Matrix4} m - The matrix to apply.
   * @return {Vector3} A reference to this vector.
   */
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  /**
   * Applies the given Quaternion to this vector.
   *
   * @param {Quaternion} q - The Quaternion.
   * @return {Vector3} A reference to this vector.
   */
  applyQuaternion(q) {
    const vx = this.x, vy = this.y, vz = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx2 = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    this.x = vx + qw * tx2 + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx2 - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx2;
    return this;
  }
  /**
   * Projects this vector from world space into the camera's normalized
   * device coordinate (NDC) space.
   *
   * @param {Camera} camera - The camera.
   * @return {Vector3} A reference to this vector.
   */
  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }
  /**
   * Unprojects this vector from the camera's normalized device coordinate (NDC)
   * space into world space.
   *
   * @param {Camera} camera - The camera.
   * @return {Vector3} A reference to this vector.
   */
  unproject(camera) {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }
  /**
   * Transforms the direction of this vector by a matrix (the upper left 3 x 3
   * subset of the given 4x4 matrix and then normalizes the result.
   *
   * @param {Matrix4} m - The matrix.
   * @return {Vector3} A reference to this vector.
   */
  transformDirection(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector3} v - The vector to divide.
   * @return {Vector3} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector3} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * If this vector's x, y or z value is greater than the given vector's x, y or z
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector3} v - The vector.
   * @return {Vector3} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }
  /**
   * If this vector's x, y or z value is less than the given vector's x, y or z
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector3} v - The vector.
   * @return {Vector3} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
  /**
   * If this vector's x, y or z value is greater than the max vector's x, y or z
   * value, it is replaced by the corresponding value.
   * If this vector's x, y or z value is less than the min vector's x, y or z value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector3} min - The minimum x, y and z values.
   * @param {Vector3} max - The maximum x, y and z values in the desired range.
   * @return {Vector3} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    this.z = clamp(this.z, min.z, max.z);
    return this;
  }
  /**
   * If this vector's x, y or z values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x, y or z values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector3} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    this.z = clamp(this.z, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector3} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector3} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x, y = -y and z = -z.
   *
   * @return {Vector3} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector3} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  // TODO lengthSquared?
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0, 0) to (x, y, z). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0, 0) to (x, y, z).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector3} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector3} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector3} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector3} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector3} v1 - The first vector.
   * @param {Vector3} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector3} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }
  /**
   * Calculates the cross product of the given vector with this instance.
   *
   * @param {Vector3} v - The vector to compute the cross product with.
   * @return {Vector3} The result of the cross product.
   */
  cross(v) {
    return this.crossVectors(this, v);
  }
  /**
   * Calculates the cross product of the given vectors and stores the result
   * in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  /**
   * Projects this vector onto the given one.
   *
   * @param {Vector3} v - The vector to project to.
   * @return {Vector3} A reference to this vector.
   */
  projectOnVector(v) {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }
  /**
   * Projects this vector onto a plane by subtracting this
   * vector projected onto the plane's normal from this vector.
   *
   * @param {Vector3} planeNormal - The plane normal.
   * @return {Vector3} A reference to this vector.
   */
  projectOnPlane(planeNormal) {
    _vector$c.copy(this).projectOnVector(planeNormal);
    return this.sub(_vector$c);
  }
  /**
   * Reflects this vector off a plane orthogonal to the given normal vector.
   *
   * @param {Vector3} normal - The (normalized) normal vector.
   * @return {Vector3} A reference to this vector.
   */
  reflect(normal) {
    return this.sub(_vector$c.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }
  /**
   * Returns the angle between the given vector and this instance in radians.
   *
   * @param {Vector3} v - The vector to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  /**
   * Computes the distance from the given vector to this instance.
   *
   * @param {Vector3} v - The vector to compute the distance to.
   * @return {number} The distance.
   */
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  /**
   * Computes the squared distance from the given vector to this instance.
   * If you are just comparing the distance with another distance, you should compare
   * the distance squared instead as it is slightly more efficient to calculate.
   *
   * @param {Vector3} v - The vector to compute the squared distance to.
   * @return {number} The squared distance.
   */
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  /**
   * Computes the Manhattan distance from the given vector to this instance.
   *
   * @param {Vector3} v - The vector to compute the Manhattan distance to.
   * @return {number} The Manhattan distance.
   */
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }
  /**
   * Sets the vector components from the given spherical coordinates.
   *
   * @param {Spherical} s - The spherical coordinates.
   * @return {Vector3} A reference to this vector.
   */
  setFromSpherical(s) {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }
  /**
   * Sets the vector components from the given spherical coordinates.
   *
   * @param {number} radius - The radius.
   * @param {number} phi - The phi angle in radians.
   * @param {number} theta - The theta angle in radians.
   * @return {Vector3} A reference to this vector.
   */
  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Math.sin(phi) * radius;
    this.x = sinPhiRadius * Math.sin(theta);
    this.y = Math.cos(phi) * radius;
    this.z = sinPhiRadius * Math.cos(theta);
    return this;
  }
  /**
   * Sets the vector components from the given cylindrical coordinates.
   *
   * @param {Cylindrical} c - The cylindrical coordinates.
   * @return {Vector3} A reference to this vector.
   */
  setFromCylindrical(c) {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }
  /**
   * Sets the vector components from the given cylindrical coordinates.
   *
   * @param {number} radius - The radius.
   * @param {number} theta - The theta angle in radians.
   * @param {number} y - The y value.
   * @return {Vector3} A reference to this vector.
   */
  setFromCylindricalCoords(radius, theta, y) {
    this.x = radius * Math.sin(theta);
    this.y = y;
    this.z = radius * Math.cos(theta);
    return this;
  }
  /**
   * Sets the vector components to the position elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixPosition(m) {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }
  /**
   * Sets the vector components to the scale elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }
  /**
   * Sets the vector components from the specified matrix column.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @param {number} index - The column index.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixColumn(m, index) {
    return this.fromArray(m.elements, index * 4);
  }
  /**
   * Sets the vector components from the specified matrix column.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @param {number} index - The column index.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrix3Column(m, index) {
    return this.fromArray(m.elements, index * 3);
  }
  /**
   * Sets the vector components from the given Euler angles.
   *
   * @param {Euler} e - The Euler angles to set.
   * @return {Vector3} A reference to this vector.
   */
  setFromEuler(e) {
    this.x = e._x;
    this.y = e._y;
    this.z = e._z;
    return this;
  }
  /**
   * Sets the vector components from the RGB components of the
   * given color.
   *
   * @param {Color} c - The color to set.
   * @return {Vector3} A reference to this vector.
   */
  setFromColor(c) {
    this.x = c.r;
    this.y = c.g;
    this.z = c.b;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector3} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]`, y value to be `array[ offset + 1 ]`
   * and z value to be `array[ offset + 2 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector3} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector3} A reference to this vector.
   */
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector3} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    return this;
  }
  /**
   * Sets this vector to a uniformly random point on a unit sphere.
   *
   * @return {Vector3} A reference to this vector.
   */
  randomDirection() {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const c = Math.sqrt(1 - u * u);
    this.x = c * Math.cos(theta);
    this.y = u;
    this.z = c * Math.sin(theta);
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
};
var _vector$c = /* @__PURE__ */ new Vector3();
var _quaternion$4 = /* @__PURE__ */ new Quaternion();
var Matrix3 = class _Matrix3 {
  /**
   * Constructs a new 3x3 matrix. The arguments are supposed to be
   * in row-major order. If no arguments are provided, the constructor
   * initializes the matrix as an identity matrix.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   */
  constructor(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    _Matrix3.prototype.isMatrix3 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n21, n22, n23, n31, n32, n33);
    }
  }
  /**
   * Sets the elements of the matrix.The arguments are supposed to be
   * in row-major order.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @return {Matrix3} A reference to this matrix.
   */
  set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    const te = this.elements;
    te[0] = n11;
    te[1] = n21;
    te[2] = n31;
    te[3] = n12;
    te[4] = n22;
    te[5] = n32;
    te[6] = n13;
    te[7] = n23;
    te[8] = n33;
    return this;
  }
  /**
   * Sets this matrix to the 3x3 identity matrix.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Copies the values of the given matrix to this instance.
   *
   * @param {Matrix3} m - The matrix to copy.
   * @return {Matrix3} A reference to this matrix.
   */
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    return this;
  }
  /**
   * Extracts the basis of this matrix into the three axis vectors provided.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix3} A reference to this matrix.
   */
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrix3Column(this, 0);
    yAxis.setFromMatrix3Column(this, 1);
    zAxis.setFromMatrix3Column(this, 2);
    return this;
  }
  /**
   * Set this matrix to the upper 3x3 matrix of the given 4x4 matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  setFromMatrix4(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[4],
      me[8],
      me[1],
      me[5],
      me[9],
      me[2],
      me[6],
      me[10]
    );
    return this;
  }
  /**
   * Post-multiplies this matrix by the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to multiply with.
   * @return {Matrix3} A reference to this matrix.
   */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  /**
   * Pre-multiplies this matrix by the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to multiply with.
   * @return {Matrix3} A reference to this matrix.
   */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  /**
   * Multiples the given 3x3 matrices and stores the result
   * in this matrix.
   *
   * @param {Matrix3} a - The first matrix.
   * @param {Matrix3} b - The second matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[3], a13 = ae[6];
    const a21 = ae[1], a22 = ae[4], a23 = ae[7];
    const a31 = ae[2], a32 = ae[5], a33 = ae[8];
    const b11 = be[0], b12 = be[3], b13 = be[6];
    const b21 = be[1], b22 = be[4], b23 = be[7];
    const b31 = be[2], b32 = be[5], b33 = be[8];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[3] = a11 * b12 + a12 * b22 + a13 * b32;
    te[6] = a11 * b13 + a12 * b23 + a13 * b33;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[4] = a21 * b12 + a22 * b22 + a23 * b32;
    te[7] = a21 * b13 + a22 * b23 + a23 * b33;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[5] = a31 * b12 + a32 * b22 + a33 * b32;
    te[8] = a31 * b13 + a32 * b23 + a33 * b33;
    return this;
  }
  /**
   * Multiplies every component of the matrix by the given scalar.
   *
   * @param {number} s - The scalar.
   * @return {Matrix3} A reference to this matrix.
   */
  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s;
    te[3] *= s;
    te[6] *= s;
    te[1] *= s;
    te[4] *= s;
    te[7] *= s;
    te[2] *= s;
    te[5] *= s;
    te[8] *= s;
    return this;
  }
  /**
   * Computes and returns the determinant of this matrix.
   *
   * @return {number} The determinant.
   */
  determinant() {
    const te = this.elements;
    const a = te[0], b = te[1], c = te[2], d = te[3], e = te[4], f = te[5], g = te[6], h = te[7], i = te[8];
    return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
  }
  /**
   * Inverts this matrix, using the [analytic method]{@link https://en.wikipedia.org/wiki/Invertible_matrix#Analytic_solution}.
   * You can not invert with a determinant of zero. If you attempt this, the method produces
   * a zero matrix instead.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n12 = te[3], n22 = te[4], n32 = te[5], n13 = te[6], n23 = te[7], n33 = te[8], t11 = n33 * n22 - n32 * n23, t12 = n32 * n13 - n33 * n12, t13 = n23 * n12 - n22 * n13, det = n11 * t11 + n21 * t12 + n31 * t13;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n31 * n23 - n33 * n21) * detInv;
    te[2] = (n32 * n21 - n31 * n22) * detInv;
    te[3] = t12 * detInv;
    te[4] = (n33 * n11 - n31 * n13) * detInv;
    te[5] = (n31 * n12 - n32 * n11) * detInv;
    te[6] = t13 * detInv;
    te[7] = (n21 * n13 - n23 * n11) * detInv;
    te[8] = (n22 * n11 - n21 * n12) * detInv;
    return this;
  }
  /**
   * Transposes this matrix in place.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  transpose() {
    let tmp2;
    const m = this.elements;
    tmp2 = m[1];
    m[1] = m[3];
    m[3] = tmp2;
    tmp2 = m[2];
    m[2] = m[6];
    m[6] = tmp2;
    tmp2 = m[5];
    m[5] = m[7];
    m[7] = tmp2;
    return this;
  }
  /**
   * Computes the normal matrix which is the inverse transpose of the upper
   * left 3x3 portion of the given 4x4 matrix.
   *
   * @param {Matrix4} matrix4 - The 4x4 matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  getNormalMatrix(matrix4) {
    return this.setFromMatrix4(matrix4).invert().transpose();
  }
  /**
   * Transposes this matrix into the supplied array, and returns itself unchanged.
   *
   * @param {Array<number>} r - An array to store the transposed matrix elements.
   * @return {Matrix3} A reference to this matrix.
   */
  transposeIntoArray(r) {
    const m = this.elements;
    r[0] = m[0];
    r[1] = m[3];
    r[2] = m[6];
    r[3] = m[1];
    r[4] = m[4];
    r[5] = m[7];
    r[6] = m[2];
    r[7] = m[5];
    r[8] = m[8];
    return this;
  }
  /**
   * Sets the UV transform matrix from offset, repeat, rotation, and center.
   *
   * @param {number} tx - Offset x.
   * @param {number} ty - Offset y.
   * @param {number} sx - Repeat x.
   * @param {number} sy - Repeat y.
   * @param {number} rotation - Rotation, in radians. Positive values rotate counterclockwise.
   * @param {number} cx - Center x of rotation.
   * @param {number} cy - Center y of rotation
   * @return {Matrix3} A reference to this matrix.
   */
  setUvTransform(tx2, ty, sx, sy, rotation, cx, cy) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    this.set(
      sx * c,
      sx * s,
      -sx * (c * cx + s * cy) + cx + tx2,
      -sy * s,
      sy * c,
      -sy * (-s * cx + c * cy) + cy + ty,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Scales this matrix with the given scalar values.
   *
   * @param {number} sx - The amount to scale in the X axis.
   * @param {number} sy - The amount to scale in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  scale(sx, sy) {
    this.premultiply(_m3.makeScale(sx, sy));
    return this;
  }
  /**
   * Rotates this matrix by the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix3} A reference to this matrix.
   */
  rotate(theta) {
    this.premultiply(_m3.makeRotation(-theta));
    return this;
  }
  /**
   * Translates this matrix by the given scalar values.
   *
   * @param {number} tx - The amount to translate in the X axis.
   * @param {number} ty - The amount to translate in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  translate(tx2, ty) {
    this.premultiply(_m3.makeTranslation(tx2, ty));
    return this;
  }
  // for 2D Transforms
  /**
   * Sets this matrix as a 2D translation transform.
   *
   * @param {number|Vector2} x - The amount to translate in the X axis or alternatively a translation vector.
   * @param {number} y - The amount to translate in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  makeTranslation(x, y) {
    if (x.isVector2) {
      this.set(
        1,
        0,
        x.x,
        0,
        1,
        x.y,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        x,
        0,
        1,
        y,
        0,
        0,
        1
      );
    }
    return this;
  }
  /**
   * Sets this matrix as a 2D rotational transformation.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix3} A reference to this matrix.
   */
  makeRotation(theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    this.set(
      c,
      -s,
      0,
      s,
      c,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a 2D scale transform.
   *
   * @param {number} x - The amount to scale in the X axis.
   * @param {number} y - The amount to scale in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  makeScale(x, y) {
    this.set(
      x,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Returns `true` if this matrix is equal with the given one.
   *
   * @param {Matrix3} matrix - The matrix to test for equality.
   * @return {boolean} Whether this matrix is equal with the given one.
   */
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 9; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  /**
   * Sets the elements of the matrix from the given array.
   *
   * @param {Array<number>} array - The matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Matrix3} A reference to this matrix.
   */
  fromArray(array, offset = 0) {
    for (let i = 0; i < 9; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  /**
   * Writes the elements of this matrix to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The matrix elements in column-major order.
   */
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    return array;
  }
  /**
   * Returns a matrix with copied values from this instance.
   *
   * @return {Matrix3} A clone of this instance.
   */
  clone() {
    return new this.constructor().fromArray(this.elements);
  }
};
var _m3 = /* @__PURE__ */ new Matrix3();
function createElementNS(name) {
  return document.createElementNS("http://www.w3.org/1999/xhtml", name);
}
var _cache = {};
function warnOnce(message) {
  if (message in _cache) return;
  _cache[message] = true;
  console.warn(message);
}
var LINEAR_REC709_TO_XYZ = /* @__PURE__ */ new Matrix3().set(
  0.4123908,
  0.3575843,
  0.1804808,
  0.212639,
  0.7151687,
  0.0721923,
  0.0193308,
  0.1191948,
  0.9505322
);
var XYZ_TO_LINEAR_REC709 = /* @__PURE__ */ new Matrix3().set(
  3.2409699,
  -1.5373832,
  -0.4986108,
  -0.9692436,
  1.8759675,
  0.0415551,
  0.0556301,
  -0.203977,
  1.0569715
);
function createColorManagement() {
  const ColorManagement2 = {
    enabled: true,
    workingColorSpace: LinearSRGBColorSpace,
    /**
     * Implementations of supported color spaces.
     *
     * Required:
     *	- primaries: chromaticity coordinates [ rx ry gx gy bx by ]
     *	- whitePoint: reference white [ x y ]
     *	- transfer: transfer function (pre-defined)
     *	- toXYZ: Matrix3 RGB to XYZ transform
     *	- fromXYZ: Matrix3 XYZ to RGB transform
     *	- luminanceCoefficients: RGB luminance coefficients
     *
     * Optional:
     *  - outputColorSpaceConfig: { drawingBufferColorSpace: ColorSpace, toneMappingMode: 'extended' | 'standard' }
     *  - workingColorSpaceConfig: { unpackColorSpace: ColorSpace }
     *
     * Reference:
     * - https://www.russellcottrell.com/photo/matrixCalculator.htm
     */
    spaces: {},
    convert: function(color, sourceColorSpace, targetColorSpace) {
      if (this.enabled === false || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
        return color;
      }
      if (this.spaces[sourceColorSpace].transfer === SRGBTransfer) {
        color.r = SRGBToLinear(color.r);
        color.g = SRGBToLinear(color.g);
        color.b = SRGBToLinear(color.b);
      }
      if (this.spaces[sourceColorSpace].primaries !== this.spaces[targetColorSpace].primaries) {
        color.applyMatrix3(this.spaces[sourceColorSpace].toXYZ);
        color.applyMatrix3(this.spaces[targetColorSpace].fromXYZ);
      }
      if (this.spaces[targetColorSpace].transfer === SRGBTransfer) {
        color.r = LinearToSRGB(color.r);
        color.g = LinearToSRGB(color.g);
        color.b = LinearToSRGB(color.b);
      }
      return color;
    },
    workingToColorSpace: function(color, targetColorSpace) {
      return this.convert(color, this.workingColorSpace, targetColorSpace);
    },
    colorSpaceToWorking: function(color, sourceColorSpace) {
      return this.convert(color, sourceColorSpace, this.workingColorSpace);
    },
    getPrimaries: function(colorSpace) {
      return this.spaces[colorSpace].primaries;
    },
    getTransfer: function(colorSpace) {
      if (colorSpace === NoColorSpace) return LinearTransfer;
      return this.spaces[colorSpace].transfer;
    },
    getToneMappingMode: function(colorSpace) {
      return this.spaces[colorSpace].outputColorSpaceConfig.toneMappingMode || "standard";
    },
    getLuminanceCoefficients: function(target, colorSpace = this.workingColorSpace) {
      return target.fromArray(this.spaces[colorSpace].luminanceCoefficients);
    },
    define: function(colorSpaces) {
      Object.assign(this.spaces, colorSpaces);
    },
    // Internal APIs
    _getMatrix: function(targetMatrix, sourceColorSpace, targetColorSpace) {
      return targetMatrix.copy(this.spaces[sourceColorSpace].toXYZ).multiply(this.spaces[targetColorSpace].fromXYZ);
    },
    _getDrawingBufferColorSpace: function(colorSpace) {
      return this.spaces[colorSpace].outputColorSpaceConfig.drawingBufferColorSpace;
    },
    _getUnpackColorSpace: function(colorSpace = this.workingColorSpace) {
      return this.spaces[colorSpace].workingColorSpaceConfig.unpackColorSpace;
    },
    // Deprecated
    fromWorkingColorSpace: function(color, targetColorSpace) {
      warnOnce("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().");
      return ColorManagement2.workingToColorSpace(color, targetColorSpace);
    },
    toWorkingColorSpace: function(color, sourceColorSpace) {
      warnOnce("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().");
      return ColorManagement2.colorSpaceToWorking(color, sourceColorSpace);
    }
  };
  const REC709_PRIMARIES = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06];
  const REC709_LUMINANCE_COEFFICIENTS = [0.2126, 0.7152, 0.0722];
  const D65 = [0.3127, 0.329];
  ColorManagement2.define({
    [LinearSRGBColorSpace]: {
      primaries: REC709_PRIMARIES,
      whitePoint: D65,
      transfer: LinearTransfer,
      toXYZ: LINEAR_REC709_TO_XYZ,
      fromXYZ: XYZ_TO_LINEAR_REC709,
      luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
      workingColorSpaceConfig: { unpackColorSpace: SRGBColorSpace },
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
    },
    [SRGBColorSpace]: {
      primaries: REC709_PRIMARIES,
      whitePoint: D65,
      transfer: SRGBTransfer,
      toXYZ: LINEAR_REC709_TO_XYZ,
      fromXYZ: XYZ_TO_LINEAR_REC709,
      luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
    }
  });
  return ColorManagement2;
}
var ColorManagement = /* @__PURE__ */ createColorManagement();
function SRGBToLinear(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
function LinearToSRGB(c) {
  return c < 31308e-7 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}
var _canvas;
var ImageUtils = class {
  /**
   * Returns a data URI containing a representation of the given image.
   *
   * @param {(HTMLImageElement|HTMLCanvasElement)} image - The image object.
   * @param {string} [type='image/png'] - Indicates the image format.
   * @return {string} The data URI.
   */
  static getDataURL(image, type = "image/png") {
    if (/^data:/i.test(image.src)) {
      return image.src;
    }
    if (typeof HTMLCanvasElement === "undefined") {
      return image.src;
    }
    let canvas;
    if (image instanceof HTMLCanvasElement) {
      canvas = image;
    } else {
      if (_canvas === void 0) _canvas = createElementNS("canvas");
      _canvas.width = image.width;
      _canvas.height = image.height;
      const context = _canvas.getContext("2d");
      if (image instanceof ImageData) {
        context.putImageData(image, 0, 0);
      } else {
        context.drawImage(image, 0, 0, image.width, image.height);
      }
      canvas = _canvas;
    }
    return canvas.toDataURL(type);
  }
  /**
   * Converts the given sRGB image data to linear color space.
   *
   * @param {(HTMLImageElement|HTMLCanvasElement|ImageBitmap|Object)} image - The image object.
   * @return {HTMLCanvasElement|Object} The converted image.
   */
  static sRGBToLinear(image) {
    if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      const canvas = createElementNS("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, image.width, image.height);
      const imageData = context.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i++) {
        data[i] = SRGBToLinear(data[i] / 255) * 255;
      }
      context.putImageData(imageData, 0, 0);
      return canvas;
    } else if (image.data) {
      const data = image.data.slice(0);
      for (let i = 0; i < data.length; i++) {
        if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
          data[i] = Math.floor(SRGBToLinear(data[i] / 255) * 255);
        } else {
          data[i] = SRGBToLinear(data[i]);
        }
      }
      return {
        data,
        width: image.width,
        height: image.height
      };
    } else {
      console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.");
      return image;
    }
  }
};
var _sourceId = 0;
var Source = class {
  /**
   * Constructs a new video texture.
   *
   * @param {any} [data=null] - The data definition of a texture.
   */
  constructor(data = null) {
    this.isSource = true;
    Object.defineProperty(this, "id", { value: _sourceId++ });
    this.uuid = generateUUID();
    this.data = data;
    this.dataReady = true;
    this.version = 0;
  }
  /**
   * Returns the dimensions of the source into the given target vector.
   *
   * @param {(Vector2|Vector3)} target - The target object the result is written into.
   * @return {(Vector2|Vector3)} The dimensions of the source.
   */
  getSize(target) {
    const data = this.data;
    if (typeof HTMLVideoElement !== "undefined" && data instanceof HTMLVideoElement) {
      target.set(data.videoWidth, data.videoHeight, 0);
    } else if (data instanceof VideoFrame) {
      target.set(data.displayHeight, data.displayWidth, 0);
    } else if (data !== null) {
      target.set(data.width, data.height, data.depth || 0);
    } else {
      target.set(0, 0, 0);
    }
    return target;
  }
  /**
   * When the property is set to `true`, the engine allocates the memory
   * for the texture (if necessary) and triggers the actual texture upload
   * to the GPU next time the source is used.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
  /**
   * Serializes the source into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized source.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.images[this.uuid] !== void 0) {
      return meta.images[this.uuid];
    }
    const output = {
      uuid: this.uuid,
      url: ""
    };
    const data = this.data;
    if (data !== null) {
      let url;
      if (Array.isArray(data)) {
        url = [];
        for (let i = 0, l = data.length; i < l; i++) {
          if (data[i].isDataTexture) {
            url.push(serializeImage(data[i].image));
          } else {
            url.push(serializeImage(data[i]));
          }
        }
      } else {
        url = serializeImage(data);
      }
      output.url = url;
    }
    if (!isRootObject) {
      meta.images[this.uuid] = output;
    }
    return output;
  }
};
function serializeImage(image) {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return ImageUtils.getDataURL(image);
  } else {
    if (image.data) {
      return {
        data: Array.from(image.data),
        width: image.width,
        height: image.height,
        type: image.data.constructor.name
      };
    } else {
      console.warn("THREE.Texture: Unable to serialize Texture.");
      return {};
    }
  }
}
var _textureId = 0;
var _tempVec3 = /* @__PURE__ */ new Vector3();
var Texture = class _Texture extends EventDispatcher {
  /**
   * Constructs a new texture.
   *
   * @param {?Object} [image=Texture.DEFAULT_IMAGE] - The image holding the texture data.
   * @param {number} [mapping=Texture.DEFAULT_MAPPING] - The texture mapping.
   * @param {number} [wrapS=ClampToEdgeWrapping] - The wrapS value.
   * @param {number} [wrapT=ClampToEdgeWrapping] - The wrapT value.
   * @param {number} [magFilter=LinearFilter] - The mag filter value.
   * @param {number} [minFilter=LinearMipmapLinearFilter] - The min filter value.
   * @param {number} [format=RGBAFormat] - The texture format.
   * @param {number} [type=UnsignedByteType] - The texture type.
   * @param {number} [anisotropy=Texture.DEFAULT_ANISOTROPY] - The anisotropy value.
   * @param {string} [colorSpace=NoColorSpace] - The color space.
   */
  constructor(image = _Texture.DEFAULT_IMAGE, mapping = _Texture.DEFAULT_MAPPING, wrapS = ClampToEdgeWrapping, wrapT = ClampToEdgeWrapping, magFilter = LinearFilter, minFilter = LinearMipmapLinearFilter, format = RGBAFormat, type = UnsignedByteType, anisotropy = _Texture.DEFAULT_ANISOTROPY, colorSpace = NoColorSpace) {
    super();
    this.isTexture = true;
    Object.defineProperty(this, "id", { value: _textureId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.source = new Source(image);
    this.mipmaps = [];
    this.mapping = mapping;
    this.channel = 0;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.magFilter = magFilter;
    this.minFilter = minFilter;
    this.anisotropy = anisotropy;
    this.format = format;
    this.internalFormat = null;
    this.type = type;
    this.offset = new Vector2(0, 0);
    this.repeat = new Vector2(1, 1);
    this.center = new Vector2(0, 0);
    this.rotation = 0;
    this.matrixAutoUpdate = true;
    this.matrix = new Matrix3();
    this.generateMipmaps = true;
    this.premultiplyAlpha = false;
    this.flipY = true;
    this.unpackAlignment = 4;
    this.colorSpace = colorSpace;
    this.userData = {};
    this.updateRanges = [];
    this.version = 0;
    this.onUpdate = null;
    this.renderTarget = null;
    this.isRenderTargetTexture = false;
    this.isArrayTexture = image && image.depth && image.depth > 1 ? true : false;
    this.pmremVersion = 0;
  }
  /**
   * The width of the texture in pixels.
   */
  get width() {
    return this.source.getSize(_tempVec3).x;
  }
  /**
   * The height of the texture in pixels.
   */
  get height() {
    return this.source.getSize(_tempVec3).y;
  }
  /**
   * The depth of the texture in pixels.
   */
  get depth() {
    return this.source.getSize(_tempVec3).z;
  }
  /**
   * The image object holding the texture data.
   *
   * @type {?Object}
   */
  get image() {
    return this.source.data;
  }
  set image(value = null) {
    this.source.data = value;
  }
  /**
   * Updates the texture transformation matrix from the from the properties {@link Texture#offset},
   * {@link Texture#repeat}, {@link Texture#rotation}, and {@link Texture#center}.
   */
  updateMatrix() {
    this.matrix.setUvTransform(this.offset.x, this.offset.y, this.repeat.x, this.repeat.y, this.rotation, this.center.x, this.center.y);
  }
  /**
   * Adds a range of data in the data texture to be updated on the GPU.
   *
   * @param {number} start - Position at which to start update.
   * @param {number} count - The number of components to update.
   */
  addUpdateRange(start, count) {
    this.updateRanges.push({ start, count });
  }
  /**
   * Clears the update ranges.
   */
  clearUpdateRanges() {
    this.updateRanges.length = 0;
  }
  /**
   * Returns a new texture with copied values from this instance.
   *
   * @return {Texture} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given texture to this instance.
   *
   * @param {Texture} source - The texture to copy.
   * @return {Texture} A reference to this instance.
   */
  copy(source2) {
    this.name = source2.name;
    this.source = source2.source;
    this.mipmaps = source2.mipmaps.slice(0);
    this.mapping = source2.mapping;
    this.channel = source2.channel;
    this.wrapS = source2.wrapS;
    this.wrapT = source2.wrapT;
    this.magFilter = source2.magFilter;
    this.minFilter = source2.minFilter;
    this.anisotropy = source2.anisotropy;
    this.format = source2.format;
    this.internalFormat = source2.internalFormat;
    this.type = source2.type;
    this.offset.copy(source2.offset);
    this.repeat.copy(source2.repeat);
    this.center.copy(source2.center);
    this.rotation = source2.rotation;
    this.matrixAutoUpdate = source2.matrixAutoUpdate;
    this.matrix.copy(source2.matrix);
    this.generateMipmaps = source2.generateMipmaps;
    this.premultiplyAlpha = source2.premultiplyAlpha;
    this.flipY = source2.flipY;
    this.unpackAlignment = source2.unpackAlignment;
    this.colorSpace = source2.colorSpace;
    this.renderTarget = source2.renderTarget;
    this.isRenderTargetTexture = source2.isRenderTargetTexture;
    this.isArrayTexture = source2.isArrayTexture;
    this.userData = JSON.parse(JSON.stringify(source2.userData));
    this.needsUpdate = true;
    return this;
  }
  /**
   * Sets this texture's properties based on `values`.
   * @param {Object} values - A container with texture parameters.
   */
  setValues(values) {
    for (const key in values) {
      const newValue = values[key];
      if (newValue === void 0) {
        console.warn(`THREE.Texture.setValues(): parameter '${key}' has value of undefined.`);
        continue;
      }
      const currentValue = this[key];
      if (currentValue === void 0) {
        console.warn(`THREE.Texture.setValues(): property '${key}' does not exist.`);
        continue;
      }
      if (currentValue && newValue && (currentValue.isVector2 && newValue.isVector2)) {
        currentValue.copy(newValue);
      } else if (currentValue && newValue && (currentValue.isVector3 && newValue.isVector3)) {
        currentValue.copy(newValue);
      } else if (currentValue && newValue && (currentValue.isMatrix3 && newValue.isMatrix3)) {
        currentValue.copy(newValue);
      } else {
        this[key] = newValue;
      }
    }
  }
  /**
   * Serializes the texture into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized texture.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.textures[this.uuid] !== void 0) {
      return meta.textures[this.uuid];
    }
    const output = {
      metadata: {
        version: 4.7,
        type: "Texture",
        generator: "Texture.toJSON"
      },
      uuid: this.uuid,
      name: this.name,
      image: this.source.toJSON(meta).uuid,
      mapping: this.mapping,
      channel: this.channel,
      repeat: [this.repeat.x, this.repeat.y],
      offset: [this.offset.x, this.offset.y],
      center: [this.center.x, this.center.y],
      rotation: this.rotation,
      wrap: [this.wrapS, this.wrapT],
      format: this.format,
      internalFormat: this.internalFormat,
      type: this.type,
      colorSpace: this.colorSpace,
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      anisotropy: this.anisotropy,
      flipY: this.flipY,
      generateMipmaps: this.generateMipmaps,
      premultiplyAlpha: this.premultiplyAlpha,
      unpackAlignment: this.unpackAlignment
    };
    if (Object.keys(this.userData).length > 0) output.userData = this.userData;
    if (!isRootObject) {
      meta.textures[this.uuid] = output;
    }
    return output;
  }
  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever this instance is no longer used in your app.
   *
   * @fires Texture#dispose
   */
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  /**
   * Transforms the given uv vector with the textures uv transformation matrix.
   *
   * @param {Vector2} uv - The uv vector.
   * @return {Vector2} The transformed uv vector.
   */
  transformUv(uv) {
    if (this.mapping !== UVMapping) return uv;
    uv.applyMatrix3(this.matrix);
    if (uv.x < 0 || uv.x > 1) {
      switch (this.wrapS) {
        case RepeatWrapping:
          uv.x = uv.x - Math.floor(uv.x);
          break;
        case ClampToEdgeWrapping:
          uv.x = uv.x < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.x) % 2) === 1) {
            uv.x = Math.ceil(uv.x) - uv.x;
          } else {
            uv.x = uv.x - Math.floor(uv.x);
          }
          break;
      }
    }
    if (uv.y < 0 || uv.y > 1) {
      switch (this.wrapT) {
        case RepeatWrapping:
          uv.y = uv.y - Math.floor(uv.y);
          break;
        case ClampToEdgeWrapping:
          uv.y = uv.y < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.y) % 2) === 1) {
            uv.y = Math.ceil(uv.y) - uv.y;
          } else {
            uv.y = uv.y - Math.floor(uv.y);
          }
          break;
      }
    }
    if (this.flipY) {
      uv.y = 1 - uv.y;
    }
    return uv;
  }
  /**
   * Setting this property to `true` indicates the engine the texture
   * must be updated in the next render. This triggers a texture upload
   * to the GPU and ensures correct texture parameter configuration.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
      this.source.needsUpdate = true;
    }
  }
  /**
   * Setting this property to `true` indicates the engine the PMREM
   * must be regenerated.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsPMREMUpdate(value) {
    if (value === true) {
      this.pmremVersion++;
    }
  }
};
Texture.DEFAULT_IMAGE = null;
Texture.DEFAULT_MAPPING = UVMapping;
Texture.DEFAULT_ANISOTROPY = 1;
var Matrix4 = class _Matrix4 {
  /**
   * Constructs a new 4x4 matrix. The arguments are supposed to be
   * in row-major order. If no arguments are provided, the constructor
   * initializes the matrix as an identity matrix.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n14] - 1-4 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n24] - 2-4 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @param {number} [n34] - 3-4 matrix element.
   * @param {number} [n41] - 4-1 matrix element.
   * @param {number} [n42] - 4-2 matrix element.
   * @param {number} [n43] - 4-3 matrix element.
   * @param {number} [n44] - 4-4 matrix element.
   */
  constructor(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    _Matrix4.prototype.isMatrix4 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44);
    }
  }
  /**
   * Sets the elements of the matrix.The arguments are supposed to be
   * in row-major order.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n14] - 1-4 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n24] - 2-4 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @param {number} [n34] - 3-4 matrix element.
   * @param {number} [n41] - 4-1 matrix element.
   * @param {number} [n42] - 4-2 matrix element.
   * @param {number} [n43] - 4-3 matrix element.
   * @param {number} [n44] - 4-4 matrix element.
   * @return {Matrix4} A reference to this matrix.
   */
  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements;
    te[0] = n11;
    te[4] = n12;
    te[8] = n13;
    te[12] = n14;
    te[1] = n21;
    te[5] = n22;
    te[9] = n23;
    te[13] = n24;
    te[2] = n31;
    te[6] = n32;
    te[10] = n33;
    te[14] = n34;
    te[3] = n41;
    te[7] = n42;
    te[11] = n43;
    te[15] = n44;
    return this;
  }
  /**
   * Sets this matrix to the 4x4 identity matrix.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Returns a matrix with copied values from this instance.
   *
   * @return {Matrix4} A clone of this instance.
   */
  clone() {
    return new _Matrix4().fromArray(this.elements);
  }
  /**
   * Copies the values of the given matrix to this instance.
   *
   * @param {Matrix4} m - The matrix to copy.
   * @return {Matrix4} A reference to this matrix.
   */
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    te[9] = me[9];
    te[10] = me[10];
    te[11] = me[11];
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    te[15] = me[15];
    return this;
  }
  /**
   * Copies the translation component of the given matrix
   * into this matrix's translation component.
   *
   * @param {Matrix4} m - The matrix to copy the translation component.
   * @return {Matrix4} A reference to this matrix.
   */
  copyPosition(m) {
    const te = this.elements, me = m.elements;
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    return this;
  }
  /**
   * Set the upper 3x3 elements of this matrix to the values of given 3x3 matrix.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  setFromMatrix3(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[3],
      me[6],
      0,
      me[1],
      me[4],
      me[7],
      0,
      me[2],
      me[5],
      me[8],
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Extracts the basis of this matrix into the three axis vectors provided.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrixColumn(this, 0);
    yAxis.setFromMatrixColumn(this, 1);
    zAxis.setFromMatrixColumn(this, 2);
    return this;
  }
  /**
   * Sets the given basis vectors to this matrix.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeBasis(xAxis, yAxis, zAxis) {
    this.set(
      xAxis.x,
      yAxis.x,
      zAxis.x,
      0,
      xAxis.y,
      yAxis.y,
      zAxis.y,
      0,
      xAxis.z,
      yAxis.z,
      zAxis.z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Extracts the rotation component of the given matrix
   * into this matrix's rotation component.
   *
   * Note: This method does not support reflection matrices.
   *
   * @param {Matrix4} m - The matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  extractRotation(m) {
    const te = this.elements;
    const me = m.elements;
    const scaleX = 1 / _v1$5.setFromMatrixColumn(m, 0).length();
    const scaleY = 1 / _v1$5.setFromMatrixColumn(m, 1).length();
    const scaleZ = 1 / _v1$5.setFromMatrixColumn(m, 2).length();
    te[0] = me[0] * scaleX;
    te[1] = me[1] * scaleX;
    te[2] = me[2] * scaleX;
    te[3] = 0;
    te[4] = me[4] * scaleY;
    te[5] = me[5] * scaleY;
    te[6] = me[6] * scaleY;
    te[7] = 0;
    te[8] = me[8] * scaleZ;
    te[9] = me[9] * scaleZ;
    te[10] = me[10] * scaleZ;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Sets the rotation component (the upper left 3x3 matrix) of this matrix to
   * the rotation specified by the given Euler angles. The rest of
   * the matrix is set to the identity. Depending on the {@link Euler#order},
   * there are six possible outcomes. See [this page]{@link https://en.wikipedia.org/wiki/Euler_angles#Rotation_matrix}
   * for a complete list.
   *
   * @param {Euler} euler - The Euler angles.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationFromEuler(euler) {
    const te = this.elements;
    const x = euler.x, y = euler.y, z = euler.z;
    const a = Math.cos(x), b = Math.sin(x);
    const c = Math.cos(y), d = Math.sin(y);
    const e = Math.cos(z), f = Math.sin(z);
    if (euler.order === "XYZ") {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;
      te[4] = -c * f;
      te[8] = d;
      te[1] = af + be * d;
      te[5] = ae - bf * d;
      te[9] = -b * c;
      te[2] = bf - ae * d;
      te[6] = be + af * d;
      te[10] = a * c;
    } else if (euler.order === "YXZ") {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce + df * b;
      te[4] = de * b - cf;
      te[8] = a * d;
      te[1] = a * f;
      te[5] = a * e;
      te[9] = -b;
      te[2] = cf * b - de;
      te[6] = df + ce * b;
      te[10] = a * c;
    } else if (euler.order === "ZXY") {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce - df * b;
      te[4] = -a * f;
      te[8] = de + cf * b;
      te[1] = cf + de * b;
      te[5] = a * e;
      te[9] = df - ce * b;
      te[2] = -a * d;
      te[6] = b;
      te[10] = a * c;
    } else if (euler.order === "ZYX") {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;
      te[4] = be * d - af;
      te[8] = ae * d + bf;
      te[1] = c * f;
      te[5] = bf * d + ae;
      te[9] = af * d - be;
      te[2] = -d;
      te[6] = b * c;
      te[10] = a * c;
    } else if (euler.order === "YZX") {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;
      te[4] = bd - ac * f;
      te[8] = bc * f + ad;
      te[1] = f;
      te[5] = a * e;
      te[9] = -b * e;
      te[2] = -d * e;
      te[6] = ad * f + bc;
      te[10] = ac - bd * f;
    } else if (euler.order === "XZY") {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;
      te[4] = -f;
      te[8] = d * e;
      te[1] = ac * f + bd;
      te[5] = a * e;
      te[9] = ad * f - bc;
      te[2] = bc * f - ad;
      te[6] = b * e;
      te[10] = bd * f + ac;
    }
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Sets the rotation component of this matrix to the rotation specified by
   * the given Quaternion as outlined [here]{@link https://en.wikipedia.org/wiki/Rotation_matrix#Quaternion}
   * The rest of the matrix is set to the identity.
   *
   * @param {Quaternion} q - The Quaternion.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationFromQuaternion(q) {
    return this.compose(_zero, q, _one);
  }
  /**
   * Sets the rotation component of the transformation matrix, looking from `eye` towards
   * `target`, and oriented by the up-direction.
   *
   * @param {Vector3} eye - The eye vector.
   * @param {Vector3} target - The target vector.
   * @param {Vector3} up - The up vector.
   * @return {Matrix4} A reference to this matrix.
   */
  lookAt(eye, target, up) {
    const te = this.elements;
    _z.subVectors(eye, target);
    if (_z.lengthSq() === 0) {
      _z.z = 1;
    }
    _z.normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) {
        _z.x += 1e-4;
      } else {
        _z.z += 1e-4;
      }
      _z.normalize();
      _x.crossVectors(up, _z);
    }
    _x.normalize();
    _y.crossVectors(_z, _x);
    te[0] = _x.x;
    te[4] = _y.x;
    te[8] = _z.x;
    te[1] = _x.y;
    te[5] = _y.y;
    te[9] = _z.y;
    te[2] = _x.z;
    te[6] = _y.z;
    te[10] = _z.z;
    return this;
  }
  /**
   * Post-multiplies this matrix by the given 4x4 matrix.
   *
   * @param {Matrix4} m - The matrix to multiply with.
   * @return {Matrix4} A reference to this matrix.
   */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  /**
   * Pre-multiplies this matrix by the given 4x4 matrix.
   *
   * @param {Matrix4} m - The matrix to multiply with.
   * @return {Matrix4} A reference to this matrix.
   */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  /**
   * Multiples the given 4x4 matrices and stores the result
   * in this matrix.
   *
   * @param {Matrix4} a - The first matrix.
   * @param {Matrix4} b - The second matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  /**
   * Multiplies every component of the matrix by the given scalar.
   *
   * @param {number} s - The scalar.
   * @return {Matrix4} A reference to this matrix.
   */
  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s;
    te[4] *= s;
    te[8] *= s;
    te[12] *= s;
    te[1] *= s;
    te[5] *= s;
    te[9] *= s;
    te[13] *= s;
    te[2] *= s;
    te[6] *= s;
    te[10] *= s;
    te[14] *= s;
    te[3] *= s;
    te[7] *= s;
    te[11] *= s;
    te[15] *= s;
    return this;
  }
  /**
   * Computes and returns the determinant of this matrix.
   *
   * Based on the method outlined [here]{@link http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.html}.
   *
   * @return {number} The determinant.
   */
  determinant() {
    const te = this.elements;
    const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12];
    const n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
    const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14];
    const n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
    return n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) + n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) + n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) + n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31);
  }
  /**
   * Transposes this matrix in place.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  transpose() {
    const te = this.elements;
    let tmp2;
    tmp2 = te[1];
    te[1] = te[4];
    te[4] = tmp2;
    tmp2 = te[2];
    te[2] = te[8];
    te[8] = tmp2;
    tmp2 = te[6];
    te[6] = te[9];
    te[9] = tmp2;
    tmp2 = te[3];
    te[3] = te[12];
    te[12] = tmp2;
    tmp2 = te[7];
    te[7] = te[13];
    te[13] = tmp2;
    tmp2 = te[11];
    te[11] = te[14];
    te[14] = tmp2;
    return this;
  }
  /**
   * Sets the position component for this matrix from the given vector,
   * without affecting the rest of the matrix.
   *
   * @param {number|Vector3} x - The x component of the vector or alternatively the vector object.
   * @param {number} y - The y component of the vector.
   * @param {number} z - The z component of the vector.
   * @return {Matrix4} A reference to this matrix.
   */
  setPosition(x, y, z) {
    const te = this.elements;
    if (x.isVector3) {
      te[12] = x.x;
      te[13] = x.y;
      te[14] = x.z;
    } else {
      te[12] = x;
      te[13] = y;
      te[14] = z;
    }
    return this;
  }
  /**
   * Inverts this matrix, using the [analytic method]{@link https://en.wikipedia.org/wiki/Invertible_matrix#Analytic_solution}.
   * You can not invert with a determinant of zero. If you attempt this, the method produces
   * a zero matrix instead.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7], n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15], t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44, t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44, t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44, t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
    te[4] = t12 * detInv;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
    te[8] = t13 * detInv;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
    te[12] = t14 * detInv;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
    return this;
  }
  /**
   * Multiplies the columns of this matrix by the given vector.
   *
   * @param {Vector3} v - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  scale(v) {
    const te = this.elements;
    const x = v.x, y = v.y, z = v.z;
    te[0] *= x;
    te[4] *= y;
    te[8] *= z;
    te[1] *= x;
    te[5] *= y;
    te[9] *= z;
    te[2] *= x;
    te[6] *= y;
    te[10] *= z;
    te[3] *= x;
    te[7] *= y;
    te[11] *= z;
    return this;
  }
  /**
   * Gets the maximum scale value of the three axes.
   *
   * @return {number} The maximum scale.
   */
  getMaxScaleOnAxis() {
    const te = this.elements;
    const scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
    const scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
    const scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }
  /**
   * Sets this matrix as a translation transform from the given vector.
   *
   * @param {number|Vector3} x - The amount to translate in the X axis or alternatively a translation vector.
   * @param {number} y - The amount to translate in the Y axis.
   * @param {number} z - The amount to translate in the z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeTranslation(x, y, z) {
    if (x.isVector3) {
      this.set(
        1,
        0,
        0,
        x.x,
        0,
        1,
        0,
        x.y,
        0,
        0,
        1,
        x.z,
        0,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        0,
        x,
        0,
        1,
        0,
        y,
        0,
        0,
        1,
        z,
        0,
        0,
        0,
        1
      );
    }
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the X axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationX(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      1,
      0,
      0,
      0,
      0,
      c,
      -s,
      0,
      0,
      s,
      c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the Y axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      c,
      0,
      s,
      0,
      0,
      1,
      0,
      0,
      -s,
      0,
      c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the Z axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      c,
      -s,
      0,
      0,
      s,
      c,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the given axis by
   * the given angle.
   *
   * This is a somewhat controversial but mathematically sound alternative to
   * rotating via Quaternions. See the discussion [here]{@link https://www.gamedev.net/articles/programming/math-and-physics/do-we-really-need-quaternions-r1199}.
   *
   * @param {Vector3} axis - The normalized rotation axis.
   * @param {number} angle - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationAxis(axis, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;
    const tx2 = t * x, ty = t * y;
    this.set(
      tx2 * x + c,
      tx2 * y - s * z,
      tx2 * z + s * y,
      0,
      tx2 * y + s * z,
      ty * y + c,
      ty * z - s * x,
      0,
      tx2 * z - s * y,
      ty * z + s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a scale transformation.
   *
   * @param {number} x - The amount to scale in the X axis.
   * @param {number} y - The amount to scale in the Y axis.
   * @param {number} z - The amount to scale in the Z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeScale(x, y, z) {
    this.set(
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      0,
      z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a shear transformation.
   *
   * @param {number} xy - The amount to shear X by Y.
   * @param {number} xz - The amount to shear X by Z.
   * @param {number} yx - The amount to shear Y by X.
   * @param {number} yz - The amount to shear Y by Z.
   * @param {number} zx - The amount to shear Z by X.
   * @param {number} zy - The amount to shear Z by Y.
   * @return {Matrix4} A reference to this matrix.
   */
  makeShear(xy, xz, yx, yz, zx, zy) {
    this.set(
      1,
      yx,
      zx,
      0,
      xy,
      1,
      zy,
      0,
      xz,
      yz,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix to the transformation composed of the given position,
   * rotation (Quaternion) and scale.
   *
   * @param {Vector3} position - The position vector.
   * @param {Quaternion} quaternion - The rotation as a Quaternion.
   * @param {Vector3} scale - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  compose(position, quaternion, scale) {
    const te = this.elements;
    const x = quaternion._x, y = quaternion._y, z = quaternion._z, w = quaternion._w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale.x, sy = scale.y, sz = scale.z;
    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;
    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;
    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;
    te[12] = position.x;
    te[13] = position.y;
    te[14] = position.z;
    te[15] = 1;
    return this;
  }
  /**
   * Decomposes this matrix into its position, rotation and scale components
   * and provides the result in the given objects.
   *
   * Note: Not all matrices are decomposable in this way. For example, if an
   * object has a non-uniformly scaled parent, then the object's world matrix
   * may not be decomposable, and this method may not be appropriate.
   *
   * @param {Vector3} position - The position vector.
   * @param {Quaternion} quaternion - The rotation as a Quaternion.
   * @param {Vector3} scale - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  decompose(position, quaternion, scale) {
    const te = this.elements;
    let sx = _v1$5.set(te[0], te[1], te[2]).length();
    const sy = _v1$5.set(te[4], te[5], te[6]).length();
    const sz = _v1$5.set(te[8], te[9], te[10]).length();
    const det = this.determinant();
    if (det < 0) sx = -sx;
    position.x = te[12];
    position.y = te[13];
    position.z = te[14];
    _m1$2.copy(this);
    const invSX = 1 / sx;
    const invSY = 1 / sy;
    const invSZ = 1 / sz;
    _m1$2.elements[0] *= invSX;
    _m1$2.elements[1] *= invSX;
    _m1$2.elements[2] *= invSX;
    _m1$2.elements[4] *= invSY;
    _m1$2.elements[5] *= invSY;
    _m1$2.elements[6] *= invSY;
    _m1$2.elements[8] *= invSZ;
    _m1$2.elements[9] *= invSZ;
    _m1$2.elements[10] *= invSZ;
    quaternion.setFromRotationMatrix(_m1$2);
    scale.x = sx;
    scale.y = sy;
    scale.z = sz;
    return this;
  }
  /**
  	 * Creates a perspective projection matrix. This is used internally by
  	 * {@link PerspectiveCamera#updateProjectionMatrix}.
  
  	 * @param {number} left - Left boundary of the viewing frustum at the near plane.
  	 * @param {number} right - Right boundary of the viewing frustum at the near plane.
  	 * @param {number} top - Top boundary of the viewing frustum at the near plane.
  	 * @param {number} bottom - Bottom boundary of the viewing frustum at the near plane.
  	 * @param {number} near - The distance from the camera to the near plane.
  	 * @param {number} far - The distance from the camera to the far plane.
  	 * @param {(WebGLCoordinateSystem|WebGPUCoordinateSystem)} [coordinateSystem=WebGLCoordinateSystem] - The coordinate system.
  	 * @param {boolean} [reversedDepth=false] - Whether to use a reversed depth.
  	 * @return {Matrix4} A reference to this matrix.
  	 */
  makePerspective(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false) {
    const te = this.elements;
    const x = 2 * near / (right - left);
    const y = 2 * near / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    let c, d;
    if (reversedDepth) {
      c = near / (far - near);
      d = far * near / (far - near);
    } else {
      if (coordinateSystem === WebGLCoordinateSystem) {
        c = -(far + near) / (far - near);
        d = -2 * far * near / (far - near);
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        c = -far / (far - near);
        d = -far * near / (far - near);
      } else {
        throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: " + coordinateSystem);
      }
    }
    te[0] = x;
    te[4] = 0;
    te[8] = a;
    te[12] = 0;
    te[1] = 0;
    te[5] = y;
    te[9] = b;
    te[13] = 0;
    te[2] = 0;
    te[6] = 0;
    te[10] = c;
    te[14] = d;
    te[3] = 0;
    te[7] = 0;
    te[11] = -1;
    te[15] = 0;
    return this;
  }
  /**
  	 * Creates a orthographic projection matrix. This is used internally by
  	 * {@link OrthographicCamera#updateProjectionMatrix}.
  
  	 * @param {number} left - Left boundary of the viewing frustum at the near plane.
  	 * @param {number} right - Right boundary of the viewing frustum at the near plane.
  	 * @param {number} top - Top boundary of the viewing frustum at the near plane.
  	 * @param {number} bottom - Bottom boundary of the viewing frustum at the near plane.
  	 * @param {number} near - The distance from the camera to the near plane.
  	 * @param {number} far - The distance from the camera to the far plane.
  	 * @param {(WebGLCoordinateSystem|WebGPUCoordinateSystem)} [coordinateSystem=WebGLCoordinateSystem] - The coordinate system.
  	 * @param {boolean} [reversedDepth=false] - Whether to use a reversed depth.
  	 * @return {Matrix4} A reference to this matrix.
  	 */
  makeOrthographic(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false) {
    const te = this.elements;
    const x = 2 / (right - left);
    const y = 2 / (top - bottom);
    const a = -(right + left) / (right - left);
    const b = -(top + bottom) / (top - bottom);
    let c, d;
    if (reversedDepth) {
      c = 1 / (far - near);
      d = far / (far - near);
    } else {
      if (coordinateSystem === WebGLCoordinateSystem) {
        c = -2 / (far - near);
        d = -(far + near) / (far - near);
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        c = -1 / (far - near);
        d = -near / (far - near);
      } else {
        throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: " + coordinateSystem);
      }
    }
    te[0] = x;
    te[4] = 0;
    te[8] = 0;
    te[12] = a;
    te[1] = 0;
    te[5] = y;
    te[9] = 0;
    te[13] = b;
    te[2] = 0;
    te[6] = 0;
    te[10] = c;
    te[14] = d;
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Returns `true` if this matrix is equal with the given one.
   *
   * @param {Matrix4} matrix - The matrix to test for equality.
   * @return {boolean} Whether this matrix is equal with the given one.
   */
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 16; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  /**
   * Sets the elements of the matrix from the given array.
   *
   * @param {Array<number>} array - The matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Matrix4} A reference to this matrix.
   */
  fromArray(array, offset = 0) {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  /**
   * Writes the elements of this matrix to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The matrix elements in column-major order.
   */
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    array[offset + 9] = te[9];
    array[offset + 10] = te[10];
    array[offset + 11] = te[11];
    array[offset + 12] = te[12];
    array[offset + 13] = te[13];
    array[offset + 14] = te[14];
    array[offset + 15] = te[15];
    return array;
  }
};
var _v1$5 = /* @__PURE__ */ new Vector3();
var _m1$2 = /* @__PURE__ */ new Matrix4();
var _zero = /* @__PURE__ */ new Vector3(0, 0, 0);
var _one = /* @__PURE__ */ new Vector3(1, 1, 1);
var _x = /* @__PURE__ */ new Vector3();
var _y = /* @__PURE__ */ new Vector3();
var _z = /* @__PURE__ */ new Vector3();
var _matrix$2 = /* @__PURE__ */ new Matrix4();
var _quaternion$3 = /* @__PURE__ */ new Quaternion();
var Euler = class _Euler {
  /**
   * Constructs a new euler instance.
   *
   * @param {number} [x=0] - The angle of the x axis in radians.
   * @param {number} [y=0] - The angle of the y axis in radians.
   * @param {number} [z=0] - The angle of the z axis in radians.
   * @param {string} [order=Euler.DEFAULT_ORDER] - A string representing the order that the rotations are applied.
   */
  constructor(x = 0, y = 0, z = 0, order = _Euler.DEFAULT_ORDER) {
    this.isEuler = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
  }
  /**
   * The angle of the x axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  /**
   * The angle of the y axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  /**
   * The angle of the z axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  /**
   * A string representing the order that the rotations are applied.
   *
   * @type {string}
   * @default 'XYZ'
   */
  get order() {
    return this._order;
  }
  set order(value) {
    this._order = value;
    this._onChangeCallback();
  }
  /**
   * Sets the Euler components.
   *
   * @param {number} x - The angle of the x axis in radians.
   * @param {number} y - The angle of the y axis in radians.
   * @param {number} z - The angle of the z axis in radians.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  set(x, y, z, order = this._order) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChangeCallback();
    return this;
  }
  /**
   * Returns a new Euler instance with copied values from this instance.
   *
   * @return {Euler} A clone of this instance.
   */
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._order);
  }
  /**
   * Copies the values of the given Euler instance to this instance.
   *
   * @param {Euler} euler - The Euler instance to copy.
   * @return {Euler} A reference to this Euler instance.
   */
  copy(euler) {
    this._x = euler._x;
    this._y = euler._y;
    this._z = euler._z;
    this._order = euler._order;
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets the angles of this Euler instance from a pure rotation matrix.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromRotationMatrix(m, order = this._order, update = true) {
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];
    switch (order) {
      case "XYZ":
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) {
          this._x = Math.atan2(-m23, m33);
          this._z = Math.atan2(-m12, m11);
        } else {
          this._x = Math.atan2(m32, m22);
          this._z = 0;
        }
        break;
      case "YXZ":
        this._x = Math.asin(-clamp(m23, -1, 1));
        if (Math.abs(m23) < 0.9999999) {
          this._y = Math.atan2(m13, m33);
          this._z = Math.atan2(m21, m22);
        } else {
          this._y = Math.atan2(-m31, m11);
          this._z = 0;
        }
        break;
      case "ZXY":
        this._x = Math.asin(clamp(m32, -1, 1));
        if (Math.abs(m32) < 0.9999999) {
          this._y = Math.atan2(-m31, m33);
          this._z = Math.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Math.atan2(m21, m11);
        }
        break;
      case "ZYX":
        this._y = Math.asin(-clamp(m31, -1, 1));
        if (Math.abs(m31) < 0.9999999) {
          this._x = Math.atan2(m32, m33);
          this._z = Math.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Math.atan2(-m12, m22);
        }
        break;
      case "YZX":
        this._z = Math.asin(clamp(m21, -1, 1));
        if (Math.abs(m21) < 0.9999999) {
          this._x = Math.atan2(-m23, m22);
          this._y = Math.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Math.atan2(m13, m33);
        }
        break;
      case "XZY":
        this._z = Math.asin(-clamp(m12, -1, 1));
        if (Math.abs(m12) < 0.9999999) {
          this._x = Math.atan2(m32, m22);
          this._y = Math.atan2(m13, m11);
        } else {
          this._x = Math.atan2(-m23, m33);
          this._y = 0;
        }
        break;
      default:
        console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: " + order);
    }
    this._order = order;
    if (update === true) this._onChangeCallback();
    return this;
  }
  /**
   * Sets the angles of this Euler instance from a normalized quaternion.
   *
   * @param {Quaternion} q - A normalized Quaternion.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromQuaternion(q, order, update) {
    _matrix$2.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(_matrix$2, order, update);
  }
  /**
   * Sets the angles of this Euler instance from the given vector.
   *
   * @param {Vector3} v - The vector.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromVector3(v, order = this._order) {
    return this.set(v.x, v.y, v.z, order);
  }
  /**
   * Resets the euler angle with a new order by creating a quaternion from this
   * euler angle and then setting this euler angle with the quaternion and the
   * new order.
   *
   * Warning: This discards revolution information.
   *
   * @param {string} [newOrder] - A string representing the new order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  reorder(newOrder) {
    _quaternion$3.setFromEuler(this);
    return this.setFromQuaternion(_quaternion$3, newOrder);
  }
  /**
   * Returns `true` if this Euler instance is equal with the given one.
   *
   * @param {Euler} euler - The Euler instance to test for equality.
   * @return {boolean} Whether this Euler instance is equal with the given one.
   */
  equals(euler) {
    return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
  }
  /**
   * Sets this Euler instance's components to values from the given array. The first three
   * entries of the array are assign to the x,y and z components. An optional fourth entry
   * defines the Euler order.
   *
   * @param {Array<number,number,number,?string>} array - An array holding the Euler component values.
   * @return {Euler} A reference to this Euler instance.
   */
  fromArray(array) {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] !== void 0) this._order = array[3];
    this._onChangeCallback();
    return this;
  }
  /**
   * Writes the components of this Euler instance to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number,number,number,string>} [array=[]] - The target array holding the Euler components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number,number,number,string>} The Euler components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._order;
  }
};
Euler.DEFAULT_ORDER = "XYZ";
var Layers = class {
  /**
   * Constructs a new layers instance, with membership
   * initially set to layer `0`.
   */
  constructor() {
    this.mask = 1 | 0;
  }
  /**
   * Sets membership to the given layer, and remove membership all other layers.
   *
   * @param {number} layer - The layer to set.
   */
  set(layer) {
    this.mask = (1 << layer | 0) >>> 0;
  }
  /**
   * Adds membership of the given layer.
   *
   * @param {number} layer - The layer to enable.
   */
  enable(layer) {
    this.mask |= 1 << layer | 0;
  }
  /**
   * Adds membership to all layers.
   */
  enableAll() {
    this.mask = 4294967295 | 0;
  }
  /**
   * Toggles the membership of the given layer.
   *
   * @param {number} layer - The layer to toggle.
   */
  toggle(layer) {
    this.mask ^= 1 << layer | 0;
  }
  /**
   * Removes membership of the given layer.
   *
   * @param {number} layer - The layer to enable.
   */
  disable(layer) {
    this.mask &= ~(1 << layer | 0);
  }
  /**
   * Removes the membership from all layers.
   */
  disableAll() {
    this.mask = 0;
  }
  /**
   * Returns `true` if this and the given layers object have at least one
   * layer in common.
   *
   * @param {Layers} layers - The layers to test.
   * @return {boolean } Whether this and the given layers object have at least one layer in common or not.
   */
  test(layers) {
    return (this.mask & layers.mask) !== 0;
  }
  /**
   * Returns `true` if the given layer is enabled.
   *
   * @param {number} layer - The layer to test.
   * @return {boolean } Whether the given layer is enabled or not.
   */
  isEnabled(layer) {
    return (this.mask & (1 << layer | 0)) !== 0;
  }
};
var _object3DId = 0;
var _v1$4 = /* @__PURE__ */ new Vector3();
var _q1 = /* @__PURE__ */ new Quaternion();
var _m1$1 = /* @__PURE__ */ new Matrix4();
var _target = /* @__PURE__ */ new Vector3();
var _position$3 = /* @__PURE__ */ new Vector3();
var _scale$2 = /* @__PURE__ */ new Vector3();
var _quaternion$2 = /* @__PURE__ */ new Quaternion();
var _xAxis = /* @__PURE__ */ new Vector3(1, 0, 0);
var _yAxis = /* @__PURE__ */ new Vector3(0, 1, 0);
var _zAxis = /* @__PURE__ */ new Vector3(0, 0, 1);
var _addedEvent = { type: "added" };
var _removedEvent = { type: "removed" };
var _childaddedEvent = { type: "childadded", child: null };
var _childremovedEvent = { type: "childremoved", child: null };
var Object3D = class _Object3D extends EventDispatcher {
  /**
   * Constructs a new 3D object.
   */
  constructor() {
    super();
    this.isObject3D = true;
    Object.defineProperty(this, "id", { value: _object3DId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "Object3D";
    this.parent = null;
    this.children = [];
    this.up = _Object3D.DEFAULT_UP.clone();
    const position = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    function onRotationChange() {
      quaternion.setFromEuler(rotation, false);
    }
    function onQuaternionChange() {
      rotation.setFromQuaternion(quaternion, void 0, false);
    }
    rotation._onChange(onRotationChange);
    quaternion._onChange(onQuaternionChange);
    Object.defineProperties(this, {
      /**
       * Represents the object's local position.
       *
       * @name Object3D#position
       * @type {Vector3}
       * @default (0,0,0)
       */
      position: {
        configurable: true,
        enumerable: true,
        value: position
      },
      /**
       * Represents the object's local rotation as Euler angles, in radians.
       *
       * @name Object3D#rotation
       * @type {Euler}
       * @default (0,0,0)
       */
      rotation: {
        configurable: true,
        enumerable: true,
        value: rotation
      },
      /**
       * Represents the object's local rotation as Quaternions.
       *
       * @name Object3D#quaternion
       * @type {Quaternion}
       */
      quaternion: {
        configurable: true,
        enumerable: true,
        value: quaternion
      },
      /**
       * Represents the object's local scale.
       *
       * @name Object3D#scale
       * @type {Vector3}
       * @default (1,1,1)
       */
      scale: {
        configurable: true,
        enumerable: true,
        value: scale
      },
      /**
       * Represents the object's model-view matrix.
       *
       * @name Object3D#modelViewMatrix
       * @type {Matrix4}
       */
      modelViewMatrix: {
        value: new Matrix4()
      },
      /**
       * Represents the object's normal matrix.
       *
       * @name Object3D#normalMatrix
       * @type {Matrix3}
       */
      normalMatrix: {
        value: new Matrix3()
      }
    });
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = _Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
    this.matrixWorldAutoUpdate = _Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE;
    this.matrixWorldNeedsUpdate = false;
    this.layers = new Layers();
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.animations = [];
    this.customDepthMaterial = void 0;
    this.customDistanceMaterial = void 0;
    this.userData = {};
  }
  /**
   * A callback that is executed immediately before a 3D object is rendered to a shadow map.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {Camera} shadowCamera - The shadow camera.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} depthMaterial - The depth material.
   * @param {Object} group - The geometry group data.
   */
  onBeforeShadow() {
  }
  /**
   * A callback that is executed immediately after a 3D object is rendered to a shadow map.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {Camera} shadowCamera - The shadow camera.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} depthMaterial - The depth material.
   * @param {Object} group - The geometry group data.
   */
  onAfterShadow() {
  }
  /**
   * A callback that is executed immediately before a 3D object is rendered.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} material - The 3D object's material.
   * @param {Object} group - The geometry group data.
   */
  onBeforeRender() {
  }
  /**
   * A callback that is executed immediately after a 3D object is rendered.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} material - The 3D object's material.
   * @param {Object} group - The geometry group data.
   */
  onAfterRender() {
  }
  /**
   * Applies the given transformation matrix to the object and updates the object's position,
   * rotation and scale.
   *
   * @param {Matrix4} matrix - The transformation matrix.
   */
  applyMatrix4(matrix) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }
  /**
   * Applies a rotation represented by given the quaternion to the 3D object.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Object3D} A reference to this instance.
   */
  applyQuaternion(q) {
    this.quaternion.premultiply(q);
    return this;
  }
  /**
   * Sets the given rotation represented as an axis/angle couple to the 3D object.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   */
  setRotationFromAxisAngle(axis, angle) {
    this.quaternion.setFromAxisAngle(axis, angle);
  }
  /**
   * Sets the given rotation represented as Euler angles to the 3D object.
   *
   * @param {Euler} euler - The Euler angles.
   */
  setRotationFromEuler(euler) {
    this.quaternion.setFromEuler(euler, true);
  }
  /**
   * Sets the given rotation represented as rotation matrix to the 3D object.
   *
   * @param {Matrix4} m - Although a 4x4 matrix is expected, the upper 3x3 portion must be
   * a pure rotation matrix (i.e, unscaled).
   */
  setRotationFromMatrix(m) {
    this.quaternion.setFromRotationMatrix(m);
  }
  /**
   * Sets the given rotation represented as a Quaternion to the 3D object.
   *
   * @param {Quaternion} q - The Quaternion
   */
  setRotationFromQuaternion(q) {
    this.quaternion.copy(q);
  }
  /**
   * Rotates the 3D object along an axis in local space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateOnAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q1);
    return this;
  }
  /**
   * Rotates the 3D object along an axis in world space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateOnWorldAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.premultiply(_q1);
    return this;
  }
  /**
   * Rotates the 3D object around its X axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateX(angle) {
    return this.rotateOnAxis(_xAxis, angle);
  }
  /**
   * Rotates the 3D object around its Y axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateY(angle) {
    return this.rotateOnAxis(_yAxis, angle);
  }
  /**
   * Rotates the 3D object around its Z axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateZ(angle) {
    return this.rotateOnAxis(_zAxis, angle);
  }
  /**
   * Translate the 3D object by a distance along the given axis in local space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateOnAxis(axis, distance2) {
    _v1$4.copy(axis).applyQuaternion(this.quaternion);
    this.position.add(_v1$4.multiplyScalar(distance2));
    return this;
  }
  /**
   * Translate the 3D object by a distance along its X-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateX(distance2) {
    return this.translateOnAxis(_xAxis, distance2);
  }
  /**
   * Translate the 3D object by a distance along its Y-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateY(distance2) {
    return this.translateOnAxis(_yAxis, distance2);
  }
  /**
   * Translate the 3D object by a distance along its Z-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateZ(distance2) {
    return this.translateOnAxis(_zAxis, distance2);
  }
  /**
   * Converts the given vector from this 3D object's local space to world space.
   *
   * @param {Vector3} vector - The vector to convert.
   * @return {Vector3} The converted vector.
   */
  localToWorld(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(this.matrixWorld);
  }
  /**
   * Converts the given vector from this 3D object's word space to local space.
   *
   * @param {Vector3} vector - The vector to convert.
   * @return {Vector3} The converted vector.
   */
  worldToLocal(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(_m1$1.copy(this.matrixWorld).invert());
  }
  /**
   * Rotates the object to face a point in world space.
   *
   * This method does not support objects having non-uniformly-scaled parent(s).
   *
   * @param {number|Vector3} x - The x coordinate in world space. Alternatively, a vector representing a position in world space
   * @param {number} [y] - The y coordinate in world space.
   * @param {number} [z] - The z coordinate in world space.
   */
  lookAt(x, y, z) {
    if (x.isVector3) {
      _target.copy(x);
    } else {
      _target.set(x, y, z);
    }
    const parent = this.parent;
    this.updateWorldMatrix(true, false);
    _position$3.setFromMatrixPosition(this.matrixWorld);
    if (this.isCamera || this.isLight) {
      _m1$1.lookAt(_position$3, _target, this.up);
    } else {
      _m1$1.lookAt(_target, _position$3, this.up);
    }
    this.quaternion.setFromRotationMatrix(_m1$1);
    if (parent) {
      _m1$1.extractRotation(parent.matrixWorld);
      _q1.setFromRotationMatrix(_m1$1);
      this.quaternion.premultiply(_q1.invert());
    }
  }
  /**
   * Adds the given 3D object as a child to this 3D object. An arbitrary number of
   * objects may be added. Any current parent on an object passed in here will be
   * removed, since an object can have at most one parent.
   *
   * @fires Object3D#added
   * @fires Object3D#childadded
   * @param {Object3D} object - The 3D object to add.
   * @return {Object3D} A reference to this instance.
   */
  add(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.add(arguments[i]);
      }
      return this;
    }
    if (object === this) {
      console.error("THREE.Object3D.add: object can't be added as a child of itself.", object);
      return this;
    }
    if (object && object.isObject3D) {
      object.removeFromParent();
      object.parent = this;
      this.children.push(object);
      object.dispatchEvent(_addedEvent);
      _childaddedEvent.child = object;
      this.dispatchEvent(_childaddedEvent);
      _childaddedEvent.child = null;
    } else {
      console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.", object);
    }
    return this;
  }
  /**
   * Removes the given 3D object as child from this 3D object.
   * An arbitrary number of objects may be removed.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @param {Object3D} object - The 3D object to remove.
   * @return {Object3D} A reference to this instance.
   */
  remove(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.remove(arguments[i]);
      }
      return this;
    }
    const index = this.children.indexOf(object);
    if (index !== -1) {
      object.parent = null;
      this.children.splice(index, 1);
      object.dispatchEvent(_removedEvent);
      _childremovedEvent.child = object;
      this.dispatchEvent(_childremovedEvent);
      _childremovedEvent.child = null;
    }
    return this;
  }
  /**
   * Removes this 3D object from its current parent.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @return {Object3D} A reference to this instance.
   */
  removeFromParent() {
    const parent = this.parent;
    if (parent !== null) {
      parent.remove(this);
    }
    return this;
  }
  /**
   * Removes all child objects.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @return {Object3D} A reference to this instance.
   */
  clear() {
    return this.remove(...this.children);
  }
  /**
   * Adds the given 3D object as a child of this 3D object, while maintaining the object's world
   * transform. This method does not support scene graphs having non-uniformly-scaled nodes(s).
   *
   * @fires Object3D#added
   * @fires Object3D#childadded
   * @param {Object3D} object - The 3D object to attach.
   * @return {Object3D} A reference to this instance.
   */
  attach(object) {
    this.updateWorldMatrix(true, false);
    _m1$1.copy(this.matrixWorld).invert();
    if (object.parent !== null) {
      object.parent.updateWorldMatrix(true, false);
      _m1$1.multiply(object.parent.matrixWorld);
    }
    object.applyMatrix4(_m1$1);
    object.removeFromParent();
    object.parent = this;
    this.children.push(object);
    object.updateWorldMatrix(false, true);
    object.dispatchEvent(_addedEvent);
    _childaddedEvent.child = object;
    this.dispatchEvent(_childaddedEvent);
    _childaddedEvent.child = null;
    return this;
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching ID.
   *
   * @param {number} id - The id.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectById(id) {
    return this.getObjectByProperty("id", id);
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching name.
   *
   * @param {string} name - The name.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectByName(name) {
    return this.getObjectByProperty("name", name);
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching property value.
   *
   * @param {string} name - The name of the property.
   * @param {any} value - The value.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectByProperty(name, value) {
    if (this[name] === value) return this;
    for (let i = 0, l = this.children.length; i < l; i++) {
      const child = this.children[i];
      const object = child.getObjectByProperty(name, value);
      if (object !== void 0) {
        return object;
      }
    }
    return void 0;
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns all 3D objects with a matching property value.
   *
   * @param {string} name - The name of the property.
   * @param {any} value - The value.
   * @param {Array<Object3D>} result - The method stores the result in this array.
   * @return {Array<Object3D>} The found 3D objects.
   */
  getObjectsByProperty(name, value, result = []) {
    if (this[name] === value) result.push(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].getObjectsByProperty(name, value, result);
    }
    return result;
  }
  /**
   * Returns a vector representing the position of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's position in world space.
   */
  getWorldPosition(target) {
    this.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.matrixWorld);
  }
  /**
   * Returns a Quaternion representing the position of the 3D object in world space.
   *
   * @param {Quaternion} target - The target Quaternion the result is stored to.
   * @return {Quaternion} The 3D object's rotation in world space.
   */
  getWorldQuaternion(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, target, _scale$2);
    return target;
  }
  /**
   * Returns a vector representing the scale of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's scale in world space.
   */
  getWorldScale(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, _quaternion$2, target);
    return target;
  }
  /**
   * Returns a vector representing the ("look") direction of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's direction in world space.
   */
  getWorldDirection(target) {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }
  /**
   * Abstract method to get intersections between a casted ray and this
   * 3D object. Renderable 3D objects such as {@link Mesh}, {@link Line} or {@link Points}
   * implement this method in order to use raycasting.
   *
   * @abstract
   * @param {Raycaster} raycaster - The raycaster.
   * @param {Array<Object>} intersects - An array holding the result of the method.
   */
  raycast() {
  }
  /**
   * Executes the callback on this 3D object and all descendants.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverse(callback) {
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback);
    }
  }
  /**
   * Like {@link Object3D#traverse}, but the callback will only be executed for visible 3D objects.
   * Descendants of invisible 3D objects are not traversed.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverseVisible(callback) {
    if (this.visible === false) return;
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverseVisible(callback);
    }
  }
  /**
   * Like {@link Object3D#traverse}, but the callback will only be executed for all ancestors.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverseAncestors(callback) {
    const parent = this.parent;
    if (parent !== null) {
      callback(parent);
      parent.traverseAncestors(callback);
    }
  }
  /**
   * Updates the transformation matrix in local space by computing it from the current
   * position, rotation and scale values.
   */
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }
  /**
   * Updates the transformation matrix in world space of this 3D objects and its descendants.
   *
   * To ensure correct results, this method also recomputes the 3D object's transformation matrix in
   * local space. The computation of the local and world matrix can be controlled with the
   * {@link Object3D#matrixAutoUpdate} and {@link Object3D#matrixWorldAutoUpdate} flags which are both
   * `true` by default.  Set these flags to `false` if you need more control over the update matrix process.
   *
   * @param {boolean} [force=false] - When set to `true`, a recomputation of world matrices is forced even
   * when {@link Object3D#matrixWorldAutoUpdate} is set to `false`.
   */
  updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) {
          this.matrixWorld.copy(this.matrix);
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
        }
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      child.updateMatrixWorld(force);
    }
  }
  /**
   * An alternative version of {@link Object3D#updateMatrixWorld} with more control over the
   * update of ancestor and descendant nodes.
   *
   * @param {boolean} [updateParents=false] Whether ancestor nodes should be updated or not.
   * @param {boolean} [updateChildren=false] Whether descendant nodes should be updated or not.
   */
  updateWorldMatrix(updateParents, updateChildren) {
    const parent = this.parent;
    if (updateParents === true && parent !== null) {
      parent.updateWorldMatrix(true, false);
    }
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldAutoUpdate === true) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
    }
    if (updateChildren === true) {
      const children = this.children;
      for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        child.updateWorldMatrix(false, true);
      }
    }
  }
  /**
   * Serializes the 3D object into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized 3D object.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    const output = {};
    if (isRootObject) {
      meta = {
        geometries: {},
        materials: {},
        textures: {},
        images: {},
        shapes: {},
        skeletons: {},
        animations: {},
        nodes: {}
      };
      output.metadata = {
        version: 4.7,
        type: "Object",
        generator: "Object3D.toJSON"
      };
    }
    const object = {};
    object.uuid = this.uuid;
    object.type = this.type;
    if (this.name !== "") object.name = this.name;
    if (this.castShadow === true) object.castShadow = true;
    if (this.receiveShadow === true) object.receiveShadow = true;
    if (this.visible === false) object.visible = false;
    if (this.frustumCulled === false) object.frustumCulled = false;
    if (this.renderOrder !== 0) object.renderOrder = this.renderOrder;
    if (Object.keys(this.userData).length > 0) object.userData = this.userData;
    object.layers = this.layers.mask;
    object.matrix = this.matrix.toArray();
    object.up = this.up.toArray();
    if (this.matrixAutoUpdate === false) object.matrixAutoUpdate = false;
    if (this.isInstancedMesh) {
      object.type = "InstancedMesh";
      object.count = this.count;
      object.instanceMatrix = this.instanceMatrix.toJSON();
      if (this.instanceColor !== null) object.instanceColor = this.instanceColor.toJSON();
    }
    if (this.isBatchedMesh) {
      object.type = "BatchedMesh";
      object.perObjectFrustumCulled = this.perObjectFrustumCulled;
      object.sortObjects = this.sortObjects;
      object.drawRanges = this._drawRanges;
      object.reservedRanges = this._reservedRanges;
      object.geometryInfo = this._geometryInfo.map((info) => ({
        ...info,
        boundingBox: info.boundingBox ? info.boundingBox.toJSON() : void 0,
        boundingSphere: info.boundingSphere ? info.boundingSphere.toJSON() : void 0
      }));
      object.instanceInfo = this._instanceInfo.map((info) => ({ ...info }));
      object.availableInstanceIds = this._availableInstanceIds.slice();
      object.availableGeometryIds = this._availableGeometryIds.slice();
      object.nextIndexStart = this._nextIndexStart;
      object.nextVertexStart = this._nextVertexStart;
      object.geometryCount = this._geometryCount;
      object.maxInstanceCount = this._maxInstanceCount;
      object.maxVertexCount = this._maxVertexCount;
      object.maxIndexCount = this._maxIndexCount;
      object.geometryInitialized = this._geometryInitialized;
      object.matricesTexture = this._matricesTexture.toJSON(meta);
      object.indirectTexture = this._indirectTexture.toJSON(meta);
      if (this._colorsTexture !== null) {
        object.colorsTexture = this._colorsTexture.toJSON(meta);
      }
      if (this.boundingSphere !== null) {
        object.boundingSphere = this.boundingSphere.toJSON();
      }
      if (this.boundingBox !== null) {
        object.boundingBox = this.boundingBox.toJSON();
      }
    }
    function serialize(library, element) {
      if (library[element.uuid] === void 0) {
        library[element.uuid] = element.toJSON(meta);
      }
      return element.uuid;
    }
    if (this.isScene) {
      if (this.background) {
        if (this.background.isColor) {
          object.background = this.background.toJSON();
        } else if (this.background.isTexture) {
          object.background = this.background.toJSON(meta).uuid;
        }
      }
      if (this.environment && this.environment.isTexture && this.environment.isRenderTargetTexture !== true) {
        object.environment = this.environment.toJSON(meta).uuid;
      }
    } else if (this.isMesh || this.isLine || this.isPoints) {
      object.geometry = serialize(meta.geometries, this.geometry);
      const parameters = this.geometry.parameters;
      if (parameters !== void 0 && parameters.shapes !== void 0) {
        const shapes = parameters.shapes;
        if (Array.isArray(shapes)) {
          for (let i = 0, l = shapes.length; i < l; i++) {
            const shape = shapes[i];
            serialize(meta.shapes, shape);
          }
        } else {
          serialize(meta.shapes, shapes);
        }
      }
    }
    if (this.isSkinnedMesh) {
      object.bindMode = this.bindMode;
      object.bindMatrix = this.bindMatrix.toArray();
      if (this.skeleton !== void 0) {
        serialize(meta.skeletons, this.skeleton);
        object.skeleton = this.skeleton.uuid;
      }
    }
    if (this.material !== void 0) {
      if (Array.isArray(this.material)) {
        const uuids = [];
        for (let i = 0, l = this.material.length; i < l; i++) {
          uuids.push(serialize(meta.materials, this.material[i]));
        }
        object.material = uuids;
      } else {
        object.material = serialize(meta.materials, this.material);
      }
    }
    if (this.children.length > 0) {
      object.children = [];
      for (let i = 0; i < this.children.length; i++) {
        object.children.push(this.children[i].toJSON(meta).object);
      }
    }
    if (this.animations.length > 0) {
      object.animations = [];
      for (let i = 0; i < this.animations.length; i++) {
        const animation = this.animations[i];
        object.animations.push(serialize(meta.animations, animation));
      }
    }
    if (isRootObject) {
      const geometries = extractFromCache(meta.geometries);
      const materials = extractFromCache(meta.materials);
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      const shapes = extractFromCache(meta.shapes);
      const skeletons = extractFromCache(meta.skeletons);
      const animations = extractFromCache(meta.animations);
      const nodes = extractFromCache(meta.nodes);
      if (geometries.length > 0) output.geometries = geometries;
      if (materials.length > 0) output.materials = materials;
      if (textures.length > 0) output.textures = textures;
      if (images.length > 0) output.images = images;
      if (shapes.length > 0) output.shapes = shapes;
      if (skeletons.length > 0) output.skeletons = skeletons;
      if (animations.length > 0) output.animations = animations;
      if (nodes.length > 0) output.nodes = nodes;
    }
    output.object = object;
    return output;
    function extractFromCache(cache2) {
      const values = [];
      for (const key in cache2) {
        const data = cache2[key];
        delete data.metadata;
        values.push(data);
      }
      return values;
    }
  }
  /**
   * Returns a new 3D object with copied values from this instance.
   *
   * @param {boolean} [recursive=true] - When set to `true`, descendants of the 3D object are also cloned.
   * @return {Object3D} A clone of this instance.
   */
  clone(recursive) {
    return new this.constructor().copy(this, recursive);
  }
  /**
   * Copies the values of the given 3D object to this instance.
   *
   * @param {Object3D} source - The 3D object to copy.
   * @param {boolean} [recursive=true] - When set to `true`, descendants of the 3D object are cloned.
   * @return {Object3D} A reference to this instance.
   */
  copy(source2, recursive = true) {
    this.name = source2.name;
    this.up.copy(source2.up);
    this.position.copy(source2.position);
    this.rotation.order = source2.rotation.order;
    this.quaternion.copy(source2.quaternion);
    this.scale.copy(source2.scale);
    this.matrix.copy(source2.matrix);
    this.matrixWorld.copy(source2.matrixWorld);
    this.matrixAutoUpdate = source2.matrixAutoUpdate;
    this.matrixWorldAutoUpdate = source2.matrixWorldAutoUpdate;
    this.matrixWorldNeedsUpdate = source2.matrixWorldNeedsUpdate;
    this.layers.mask = source2.layers.mask;
    this.visible = source2.visible;
    this.castShadow = source2.castShadow;
    this.receiveShadow = source2.receiveShadow;
    this.frustumCulled = source2.frustumCulled;
    this.renderOrder = source2.renderOrder;
    this.animations = source2.animations.slice();
    this.userData = JSON.parse(JSON.stringify(source2.userData));
    if (recursive === true) {
      for (let i = 0; i < source2.children.length; i++) {
        const child = source2.children[i];
        this.add(child.clone());
      }
    }
    return this;
  }
};
Object3D.DEFAULT_UP = /* @__PURE__ */ new Vector3(0, 1, 0);
Object3D.DEFAULT_MATRIX_AUTO_UPDATE = true;
Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = true;
var _colorKeywords = {
  "aliceblue": 15792383,
  "antiquewhite": 16444375,
  "aqua": 65535,
  "aquamarine": 8388564,
  "azure": 15794175,
  "beige": 16119260,
  "bisque": 16770244,
  "black": 0,
  "blanchedalmond": 16772045,
  "blue": 255,
  "blueviolet": 9055202,
  "brown": 10824234,
  "burlywood": 14596231,
  "cadetblue": 6266528,
  "chartreuse": 8388352,
  "chocolate": 13789470,
  "coral": 16744272,
  "cornflowerblue": 6591981,
  "cornsilk": 16775388,
  "crimson": 14423100,
  "cyan": 65535,
  "darkblue": 139,
  "darkcyan": 35723,
  "darkgoldenrod": 12092939,
  "darkgray": 11119017,
  "darkgreen": 25600,
  "darkgrey": 11119017,
  "darkkhaki": 12433259,
  "darkmagenta": 9109643,
  "darkolivegreen": 5597999,
  "darkorange": 16747520,
  "darkorchid": 10040012,
  "darkred": 9109504,
  "darksalmon": 15308410,
  "darkseagreen": 9419919,
  "darkslateblue": 4734347,
  "darkslategray": 3100495,
  "darkslategrey": 3100495,
  "darkturquoise": 52945,
  "darkviolet": 9699539,
  "deeppink": 16716947,
  "deepskyblue": 49151,
  "dimgray": 6908265,
  "dimgrey": 6908265,
  "dodgerblue": 2003199,
  "firebrick": 11674146,
  "floralwhite": 16775920,
  "forestgreen": 2263842,
  "fuchsia": 16711935,
  "gainsboro": 14474460,
  "ghostwhite": 16316671,
  "gold": 16766720,
  "goldenrod": 14329120,
  "gray": 8421504,
  "green": 32768,
  "greenyellow": 11403055,
  "grey": 8421504,
  "honeydew": 15794160,
  "hotpink": 16738740,
  "indianred": 13458524,
  "indigo": 4915330,
  "ivory": 16777200,
  "khaki": 15787660,
  "lavender": 15132410,
  "lavenderblush": 16773365,
  "lawngreen": 8190976,
  "lemonchiffon": 16775885,
  "lightblue": 11393254,
  "lightcoral": 15761536,
  "lightcyan": 14745599,
  "lightgoldenrodyellow": 16448210,
  "lightgray": 13882323,
  "lightgreen": 9498256,
  "lightgrey": 13882323,
  "lightpink": 16758465,
  "lightsalmon": 16752762,
  "lightseagreen": 2142890,
  "lightskyblue": 8900346,
  "lightslategray": 7833753,
  "lightslategrey": 7833753,
  "lightsteelblue": 11584734,
  "lightyellow": 16777184,
  "lime": 65280,
  "limegreen": 3329330,
  "linen": 16445670,
  "magenta": 16711935,
  "maroon": 8388608,
  "mediumaquamarine": 6737322,
  "mediumblue": 205,
  "mediumorchid": 12211667,
  "mediumpurple": 9662683,
  "mediumseagreen": 3978097,
  "mediumslateblue": 8087790,
  "mediumspringgreen": 64154,
  "mediumturquoise": 4772300,
  "mediumvioletred": 13047173,
  "midnightblue": 1644912,
  "mintcream": 16121850,
  "mistyrose": 16770273,
  "moccasin": 16770229,
  "navajowhite": 16768685,
  "navy": 128,
  "oldlace": 16643558,
  "olive": 8421376,
  "olivedrab": 7048739,
  "orange": 16753920,
  "orangered": 16729344,
  "orchid": 14315734,
  "palegoldenrod": 15657130,
  "palegreen": 10025880,
  "paleturquoise": 11529966,
  "palevioletred": 14381203,
  "papayawhip": 16773077,
  "peachpuff": 16767673,
  "peru": 13468991,
  "pink": 16761035,
  "plum": 14524637,
  "powderblue": 11591910,
  "purple": 8388736,
  "rebeccapurple": 6697881,
  "red": 16711680,
  "rosybrown": 12357519,
  "royalblue": 4286945,
  "saddlebrown": 9127187,
  "salmon": 16416882,
  "sandybrown": 16032864,
  "seagreen": 3050327,
  "seashell": 16774638,
  "sienna": 10506797,
  "silver": 12632256,
  "skyblue": 8900331,
  "slateblue": 6970061,
  "slategray": 7372944,
  "slategrey": 7372944,
  "snow": 16775930,
  "springgreen": 65407,
  "steelblue": 4620980,
  "tan": 13808780,
  "teal": 32896,
  "thistle": 14204888,
  "tomato": 16737095,
  "turquoise": 4251856,
  "violet": 15631086,
  "wheat": 16113331,
  "white": 16777215,
  "whitesmoke": 16119285,
  "yellow": 16776960,
  "yellowgreen": 10145074
};
var _hslA = { h: 0, s: 0, l: 0 };
var _hslB = { h: 0, s: 0, l: 0 };
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}
var Color = class {
  /**
   * Constructs a new color.
   *
   * Note that standard method of specifying color in three.js is with a hexadecimal triplet,
   * and that method is used throughout the rest of the documentation.
   *
   * @param {(number|string|Color)} [r] - The red component of the color. If `g` and `b` are
   * not provided, it can be hexadecimal triplet, a CSS-style string or another `Color` instance.
   * @param {number} [g] - The green component.
   * @param {number} [b] - The blue component.
   */
  constructor(r, g, b) {
    this.isColor = true;
    this.r = 1;
    this.g = 1;
    this.b = 1;
    return this.set(r, g, b);
  }
  /**
   * Sets the colors's components from the given values.
   *
   * @param {(number|string|Color)} [r] - The red component of the color. If `g` and `b` are
   * not provided, it can be hexadecimal triplet, a CSS-style string or another `Color` instance.
   * @param {number} [g] - The green component.
   * @param {number} [b] - The blue component.
   * @return {Color} A reference to this color.
   */
  set(r, g, b) {
    if (g === void 0 && b === void 0) {
      const value = r;
      if (value && value.isColor) {
        this.copy(value);
      } else if (typeof value === "number") {
        this.setHex(value);
      } else if (typeof value === "string") {
        this.setStyle(value);
      }
    } else {
      this.setRGB(r, g, b);
    }
    return this;
  }
  /**
   * Sets the colors's components to the given scalar value.
   *
   * @param {number} scalar - The scalar value.
   * @return {Color} A reference to this color.
   */
  setScalar(scalar) {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;
    return this;
  }
  /**
   * Sets this color from a hexadecimal value.
   *
   * @param {number} hex - The hexadecimal value.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setHex(hex, colorSpace = SRGBColorSpace) {
    hex = Math.floor(hex);
    this.r = (hex >> 16 & 255) / 255;
    this.g = (hex >> 8 & 255) / 255;
    this.b = (hex & 255) / 255;
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from RGB values.
   *
   * @param {number} r - Red channel value between `0.0` and `1.0`.
   * @param {number} g - Green channel value between `0.0` and `1.0`.
   * @param {number} b - Blue channel value between `0.0` and `1.0`.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setRGB(r, g, b, colorSpace = ColorManagement.workingColorSpace) {
    this.r = r;
    this.g = g;
    this.b = b;
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from RGB values.
   *
   * @param {number} h - Hue value between `0.0` and `1.0`.
   * @param {number} s - Saturation value between `0.0` and `1.0`.
   * @param {number} l - Lightness value between `0.0` and `1.0`.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setHSL(h, s, l, colorSpace = ColorManagement.workingColorSpace) {
    h = euclideanModulo(h, 1);
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;
      this.r = hue2rgb(q, p, h + 1 / 3);
      this.g = hue2rgb(q, p, h);
      this.b = hue2rgb(q, p, h - 1 / 3);
    }
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from a CSS-style string. For example, `rgb(250, 0,0)`,
   * `rgb(100%, 0%, 0%)`, `hsl(0, 100%, 50%)`, `#ff0000`, `#f00`, or `red` ( or
   * any [X11 color name]{@link https://en.wikipedia.org/wiki/X11_color_names#Color_name_chart} -
   * all 140 color names are supported).
   *
   * @param {string} style - Color as a CSS-style string.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setStyle(style, colorSpace = SRGBColorSpace) {
    function handleAlpha(string) {
      if (string === void 0) return;
      if (parseFloat(string) < 1) {
        console.warn("THREE.Color: Alpha component of " + style + " will be ignored.");
      }
    }
    let m;
    if (m = /^(\w+)\(([^\)]*)\)/.exec(style)) {
      let color;
      const name = m[1];
      const components = m[2];
      switch (name) {
        case "rgb":
        case "rgba":
          if (color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(255, parseInt(color[1], 10)) / 255,
              Math.min(255, parseInt(color[2], 10)) / 255,
              Math.min(255, parseInt(color[3], 10)) / 255,
              colorSpace
            );
          }
          if (color = /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(100, parseInt(color[1], 10)) / 100,
              Math.min(100, parseInt(color[2], 10)) / 100,
              Math.min(100, parseInt(color[3], 10)) / 100,
              colorSpace
            );
          }
          break;
        case "hsl":
        case "hsla":
          if (color = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setHSL(
              parseFloat(color[1]) / 360,
              parseFloat(color[2]) / 100,
              parseFloat(color[3]) / 100,
              colorSpace
            );
          }
          break;
        default:
          console.warn("THREE.Color: Unknown color model " + style);
      }
    } else if (m = /^\#([A-Fa-f\d]+)$/.exec(style)) {
      const hex = m[1];
      const size = hex.length;
      if (size === 3) {
        return this.setRGB(
          parseInt(hex.charAt(0), 16) / 15,
          parseInt(hex.charAt(1), 16) / 15,
          parseInt(hex.charAt(2), 16) / 15,
          colorSpace
        );
      } else if (size === 6) {
        return this.setHex(parseInt(hex, 16), colorSpace);
      } else {
        console.warn("THREE.Color: Invalid hex color " + style);
      }
    } else if (style && style.length > 0) {
      return this.setColorName(style, colorSpace);
    }
    return this;
  }
  /**
   * Sets this color from a color name. Faster than {@link Color#setStyle} if
   * you don't need the other CSS-style formats.
   *
   * For convenience, the list of names is exposed in `Color.NAMES` as a hash.
   * ```js
   * Color.NAMES.aliceblue // returns 0xF0F8FF
   * ```
   *
   * @param {string} style - The color name.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setColorName(style, colorSpace = SRGBColorSpace) {
    const hex = _colorKeywords[style.toLowerCase()];
    if (hex !== void 0) {
      this.setHex(hex, colorSpace);
    } else {
      console.warn("THREE.Color: Unknown color " + style);
    }
    return this;
  }
  /**
   * Returns a new color with copied values from this instance.
   *
   * @return {Color} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.r, this.g, this.b);
  }
  /**
   * Copies the values of the given color to this instance.
   *
   * @param {Color} color - The color to copy.
   * @return {Color} A reference to this color.
   */
  copy(color) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }
  /**
   * Copies the given color into this color, and then converts this color from
   * `SRGBColorSpace` to `LinearSRGBColorSpace`.
   *
   * @param {Color} color - The color to copy/convert.
   * @return {Color} A reference to this color.
   */
  copySRGBToLinear(color) {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);
    return this;
  }
  /**
   * Copies the given color into this color, and then converts this color from
   * `LinearSRGBColorSpace` to `SRGBColorSpace`.
   *
   * @param {Color} color - The color to copy/convert.
   * @return {Color} A reference to this color.
   */
  copyLinearToSRGB(color) {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);
    return this;
  }
  /**
   * Converts this color from `SRGBColorSpace` to `LinearSRGBColorSpace`.
   *
   * @return {Color} A reference to this color.
   */
  convertSRGBToLinear() {
    this.copySRGBToLinear(this);
    return this;
  }
  /**
   * Converts this color from `LinearSRGBColorSpace` to `SRGBColorSpace`.
   *
   * @return {Color} A reference to this color.
   */
  convertLinearToSRGB() {
    this.copyLinearToSRGB(this);
    return this;
  }
  /**
   * Returns the hexadecimal value of this color.
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {number} The hexadecimal value.
   */
  getHex(colorSpace = SRGBColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    return Math.round(clamp(_color.r * 255, 0, 255)) * 65536 + Math.round(clamp(_color.g * 255, 0, 255)) * 256 + Math.round(clamp(_color.b * 255, 0, 255));
  }
  /**
   * Returns the hexadecimal value of this color as a string (for example, 'FFFFFF').
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {string} The hexadecimal value as a string.
   */
  getHexString(colorSpace = SRGBColorSpace) {
    return ("000000" + this.getHex(colorSpace).toString(16)).slice(-6);
  }
  /**
   * Converts the colors RGB values into the HSL format and stores them into the
   * given target object.
   *
   * @param {{h:number,s:number,l:number}} target - The target object that is used to store the method's result.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {{h:number,s:number,l:number}} The HSL representation of this color.
   */
  getHSL(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    const r = _color.r, g = _color.g, b = _color.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue, saturation;
    const lightness = (min + max) / 2;
    if (min === max) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max - min;
      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        case b:
          hue = (r - g) / delta + 4;
          break;
      }
      hue /= 6;
    }
    target.h = hue;
    target.s = saturation;
    target.l = lightness;
    return target;
  }
  /**
   * Returns the RGB values of this color and stores them into the given target object.
   *
   * @param {Color} target - The target color that is used to store the method's result.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} The RGB representation of this color.
   */
  getRGB(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    target.r = _color.r;
    target.g = _color.g;
    target.b = _color.b;
    return target;
  }
  /**
   * Returns the value of this color as a CSS style string. Example: `rgb(255,0,0)`.
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {string} The CSS representation of this color.
   */
  getStyle(colorSpace = SRGBColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    const r = _color.r, g = _color.g, b = _color.b;
    if (colorSpace !== SRGBColorSpace) {
      return `color(${colorSpace} ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)})`;
    }
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }
  /**
   * Adds the given HSL values to this color's values.
   * Internally, this converts the color's RGB values to HSL, adds HSL
   * and then converts the color back to RGB.
   *
   * @param {number} h - Hue value between `0.0` and `1.0`.
   * @param {number} s - Saturation value between `0.0` and `1.0`.
   * @param {number} l - Lightness value between `0.0` and `1.0`.
   * @return {Color} A reference to this color.
   */
  offsetHSL(h, s, l) {
    this.getHSL(_hslA);
    return this.setHSL(_hslA.h + h, _hslA.s + s, _hslA.l + l);
  }
  /**
   * Adds the RGB values of the given color to the RGB values of this color.
   *
   * @param {Color} color - The color to add.
   * @return {Color} A reference to this color.
   */
  add(color) {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    return this;
  }
  /**
   * Adds the RGB values of the given colors and stores the result in this instance.
   *
   * @param {Color} color1 - The first color.
   * @param {Color} color2 - The second color.
   * @return {Color} A reference to this color.
   */
  addColors(color1, color2) {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;
    return this;
  }
  /**
   * Adds the given scalar value to the RGB values of this color.
   *
   * @param {number} s - The scalar to add.
   * @return {Color} A reference to this color.
   */
  addScalar(s) {
    this.r += s;
    this.g += s;
    this.b += s;
    return this;
  }
  /**
   * Subtracts the RGB values of the given color from the RGB values of this color.
   *
   * @param {Color} color - The color to subtract.
   * @return {Color} A reference to this color.
   */
  sub(color) {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);
    return this;
  }
  /**
   * Multiplies the RGB values of the given color with the RGB values of this color.
   *
   * @param {Color} color - The color to multiply.
   * @return {Color} A reference to this color.
   */
  multiply(color) {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;
    return this;
  }
  /**
   * Multiplies the given scalar value with the RGB values of this color.
   *
   * @param {number} s - The scalar to multiply.
   * @return {Color} A reference to this color.
   */
  multiplyScalar(s) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
  /**
   * Linearly interpolates this color's RGB values toward the RGB values of the
   * given color. The alpha argument can be thought of as the ratio between
   * the two colors, where `0.0` is this color and `1.0` is the first argument.
   *
   * @param {Color} color - The color to converge on.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerp(color, alpha) {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given colors and stores the result in this instance.
   * The alpha argument can be thought of as the ratio between the two colors, where `0.0`
   * is the first and `1.0` is the second color.
   *
   * @param {Color} color1 - The first color.
   * @param {Color} color2 - The second color.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerpColors(color1, color2, alpha) {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;
    return this;
  }
  /**
   * Linearly interpolates this color's HSL values toward the HSL values of the
   * given color. It differs from {@link Color#lerp} by not interpolating straight
   * from one color to the other, but instead going through all the hues in between
   * those two colors. The alpha argument can be thought of as the ratio between
   * the two colors, where 0.0 is this color and 1.0 is the first argument.
   *
   * @param {Color} color - The color to converge on.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerpHSL(color, alpha) {
    this.getHSL(_hslA);
    color.getHSL(_hslB);
    const h = lerp(_hslA.h, _hslB.h, alpha);
    const s = lerp(_hslA.s, _hslB.s, alpha);
    const l = lerp(_hslA.l, _hslB.l, alpha);
    this.setHSL(h, s, l);
    return this;
  }
  /**
   * Sets the color's RGB components from the given 3D vector.
   *
   * @param {Vector3} v - The vector to set.
   * @return {Color} A reference to this color.
   */
  setFromVector3(v) {
    this.r = v.x;
    this.g = v.y;
    this.b = v.z;
    return this;
  }
  /**
   * Transforms this color with the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix.
   * @return {Color} A reference to this color.
   */
  applyMatrix3(m) {
    const r = this.r, g = this.g, b = this.b;
    const e = m.elements;
    this.r = e[0] * r + e[3] * g + e[6] * b;
    this.g = e[1] * r + e[4] * g + e[7] * b;
    this.b = e[2] * r + e[5] * g + e[8] * b;
    return this;
  }
  /**
   * Returns `true` if this color is equal with the given one.
   *
   * @param {Color} c - The color to test for equality.
   * @return {boolean} Whether this bounding color is equal with the given one.
   */
  equals(c) {
    return c.r === this.r && c.g === this.g && c.b === this.b;
  }
  /**
   * Sets this color's RGB components from the given array.
   *
   * @param {Array<number>} array - An array holding the RGB values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Color} A reference to this color.
   */
  fromArray(array, offset = 0) {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];
    return this;
  }
  /**
   * Writes the RGB components of this color to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the color components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The color components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }
  /**
   * Sets the components of this color from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding color data.
   * @param {number} index - The index into the attribute.
   * @return {Color} A reference to this color.
   */
  fromBufferAttribute(attribute, index) {
    this.r = attribute.getX(index);
    this.g = attribute.getY(index);
    this.b = attribute.getZ(index);
    return this;
  }
  /**
   * This methods defines the serialization result of this class. Returns the color
   * as a hexadecimal value.
   *
   * @return {number} The hexadecimal value.
   */
  toJSON() {
    return this.getHex();
  }
  *[Symbol.iterator]() {
    yield this.r;
    yield this.g;
    yield this.b;
  }
};
var _color = /* @__PURE__ */ new Color();
Color.NAMES = _colorKeywords;
function cloneUniforms(src) {
  const dst = {};
  for (const u in src) {
    dst[u] = {};
    for (const p in src[u]) {
      const property = src[u][p];
      if (property && (property.isColor || property.isMatrix3 || property.isMatrix4 || property.isVector2 || property.isVector3 || property.isVector4 || property.isTexture || property.isQuaternion)) {
        if (property.isRenderTargetTexture) {
          console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().");
          dst[u][p] = null;
        } else {
          dst[u][p] = property.clone();
        }
      } else if (Array.isArray(property)) {
        dst[u][p] = property.slice();
      } else {
        dst[u][p] = property;
      }
    }
  }
  return dst;
}
function mergeUniforms(uniforms) {
  const merged = {};
  for (let u = 0; u < uniforms.length; u++) {
    const tmp2 = cloneUniforms(uniforms[u]);
    for (const p in tmp2) {
      merged[p] = tmp2[p];
    }
  }
  return merged;
}
var Curve = class {
  /**
   * Constructs a new curve.
   */
  constructor() {
    this.type = "Curve";
    this.arcLengthDivisions = 200;
    this.needsUpdate = false;
    this.cacheArcLengths = null;
  }
  /**
   * This method returns a vector in 2D or 3D space (depending on the curve definition)
   * for the given interpolation factor.
   *
   * @abstract
   * @param {number} t - A interpolation factor representing a position on the curve. Must be in the range `[0,1]`.
   * @param {(Vector2|Vector3)} [optionalTarget] - The optional target vector the result is written to.
   * @return {(Vector2|Vector3)} The position on the curve. It can be a 2D or 3D vector depending on the curve definition.
   */
  getPoint() {
    console.warn("THREE.Curve: .getPoint() not implemented.");
  }
  /**
   * This method returns a vector in 2D or 3D space (depending on the curve definition)
   * for the given interpolation factor. Unlike {@link Curve#getPoint}, this method honors the length
   * of the curve which equidistant samples.
   *
   * @param {number} u - A interpolation factor representing a position on the curve. Must be in the range `[0,1]`.
   * @param {(Vector2|Vector3)} [optionalTarget] - The optional target vector the result is written to.
   * @return {(Vector2|Vector3)} The position on the curve. It can be a 2D or 3D vector depending on the curve definition.
   */
  getPointAt(u, optionalTarget) {
    const t = this.getUtoTmapping(u);
    return this.getPoint(t, optionalTarget);
  }
  /**
   * This method samples the curve via {@link Curve#getPoint} and returns an array of points representing
   * the curve shape.
   *
   * @param {number} [divisions=5] - The number of divisions.
   * @return {Array<(Vector2|Vector3)>} An array holding the sampled curve values. The number of points is `divisions + 1`.
   */
  getPoints(divisions = 5) {
    const points = [];
    for (let d = 0; d <= divisions; d++) {
      points.push(this.getPoint(d / divisions));
    }
    return points;
  }
  // Get sequence of points using getPointAt( u )
  /**
   * This method samples the curve via {@link Curve#getPointAt} and returns an array of points representing
   * the curve shape. Unlike {@link Curve#getPoints}, this method returns equi-spaced points across the entire
   * curve.
   *
   * @param {number} [divisions=5] - The number of divisions.
   * @return {Array<(Vector2|Vector3)>} An array holding the sampled curve values. The number of points is `divisions + 1`.
   */
  getSpacedPoints(divisions = 5) {
    const points = [];
    for (let d = 0; d <= divisions; d++) {
      points.push(this.getPointAt(d / divisions));
    }
    return points;
  }
  /**
   * Returns the total arc length of the curve.
   *
   * @return {number} The length of the curve.
   */
  getLength() {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1];
  }
  /**
   * Returns an array of cumulative segment lengths of the curve.
   *
   * @param {number} [divisions=this.arcLengthDivisions] - The number of divisions.
   * @return {Array<number>} An array holding the cumulative segment lengths.
   */
  getLengths(divisions = this.arcLengthDivisions) {
    if (this.cacheArcLengths && this.cacheArcLengths.length === divisions + 1 && !this.needsUpdate) {
      return this.cacheArcLengths;
    }
    this.needsUpdate = false;
    const cache2 = [];
    let current, last = this.getPoint(0);
    let sum = 0;
    cache2.push(0);
    for (let p = 1; p <= divisions; p++) {
      current = this.getPoint(p / divisions);
      sum += current.distanceTo(last);
      cache2.push(sum);
      last = current;
    }
    this.cacheArcLengths = cache2;
    return cache2;
  }
  /**
   * Update the cumulative segment distance cache. The method must be called
   * every time curve parameters are changed. If an updated curve is part of a
   * composed curve like {@link CurvePath}, this method must be called on the
   * composed curve, too.
   */
  updateArcLengths() {
    this.needsUpdate = true;
    this.getLengths();
  }
  /**
   * Given an interpolation factor in the range `[0,1]`, this method returns an updated
   * interpolation factor in the same range that can be ued to sample equidistant points
   * from a curve.
   *
   * @param {number} u - The interpolation factor.
   * @param {?number} distance - An optional distance on the curve.
   * @return {number} The updated interpolation factor.
   */
  getUtoTmapping(u, distance2 = null) {
    const arcLengths = this.getLengths();
    let i = 0;
    const il = arcLengths.length;
    let targetArcLength;
    if (distance2) {
      targetArcLength = distance2;
    } else {
      targetArcLength = u * arcLengths[il - 1];
    }
    let low = 0, high = il - 1, comparison;
    while (low <= high) {
      i = Math.floor(low + (high - low) / 2);
      comparison = arcLengths[i] - targetArcLength;
      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;
      }
    }
    i = high;
    if (arcLengths[i] === targetArcLength) {
      return i / (il - 1);
    }
    const lengthBefore = arcLengths[i];
    const lengthAfter = arcLengths[i + 1];
    const segmentLength = lengthAfter - lengthBefore;
    const segmentFraction = (targetArcLength - lengthBefore) / segmentLength;
    const t = (i + segmentFraction) / (il - 1);
    return t;
  }
  /**
   * Returns a unit vector tangent for the given interpolation factor.
   * If the derived curve does not implement its tangent derivation,
   * two points a small delta apart will be used to find its gradient
   * which seems to give a reasonable approximation.
   *
   * @param {number} t - The interpolation factor.
   * @param {(Vector2|Vector3)} [optionalTarget] - The optional target vector the result is written to.
   * @return {(Vector2|Vector3)} The tangent vector.
   */
  getTangent(t, optionalTarget) {
    const delta = 1e-4;
    let t1 = t - delta;
    let t2 = t + delta;
    if (t1 < 0) t1 = 0;
    if (t2 > 1) t2 = 1;
    const pt1 = this.getPoint(t1);
    const pt2 = this.getPoint(t2);
    const tangent = optionalTarget || (pt1.isVector2 ? new Vector2() : new Vector3());
    tangent.copy(pt2).sub(pt1).normalize();
    return tangent;
  }
  /**
   * Same as {@link Curve#getTangent} but with equidistant samples.
   *
   * @param {number} u - The interpolation factor.
   * @param {(Vector2|Vector3)} [optionalTarget] - The optional target vector the result is written to.
   * @return {(Vector2|Vector3)} The tangent vector.
   * @see {@link Curve#getPointAt}
   */
  getTangentAt(u, optionalTarget) {
    const t = this.getUtoTmapping(u);
    return this.getTangent(t, optionalTarget);
  }
  /**
   * Generates the Frenet Frames. Requires a curve definition in 3D space. Used
   * in geometries like {@link TubeGeometry} or {@link ExtrudeGeometry}.
   *
   * @param {number} segments - The number of segments.
   * @param {boolean} [closed=false] - Whether the curve is closed or not.
   * @return {{tangents: Array<Vector3>, normals: Array<Vector3>, binormals: Array<Vector3>}} The Frenet Frames.
   */
  computeFrenetFrames(segments, closed = false) {
    const normal = new Vector3();
    const tangents = [];
    const normals = [];
    const binormals = [];
    const vec = new Vector3();
    const mat = new Matrix4();
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      tangents[i] = this.getTangentAt(u, new Vector3());
    }
    normals[0] = new Vector3();
    binormals[0] = new Vector3();
    let min = Number.MAX_VALUE;
    const tx2 = Math.abs(tangents[0].x);
    const ty = Math.abs(tangents[0].y);
    const tz = Math.abs(tangents[0].z);
    if (tx2 <= min) {
      min = tx2;
      normal.set(1, 0, 0);
    }
    if (ty <= min) {
      min = ty;
      normal.set(0, 1, 0);
    }
    if (tz <= min) {
      normal.set(0, 0, 1);
    }
    vec.crossVectors(tangents[0], normal).normalize();
    normals[0].crossVectors(tangents[0], vec);
    binormals[0].crossVectors(tangents[0], normals[0]);
    for (let i = 1; i <= segments; i++) {
      normals[i] = normals[i - 1].clone();
      binormals[i] = binormals[i - 1].clone();
      vec.crossVectors(tangents[i - 1], tangents[i]);
      if (vec.length() > Number.EPSILON) {
        vec.normalize();
        const theta = Math.acos(clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normals[i].applyMatrix4(mat.makeRotationAxis(vec, theta));
      }
      binormals[i].crossVectors(tangents[i], normals[i]);
    }
    if (closed === true) {
      let theta = Math.acos(clamp(normals[0].dot(normals[segments]), -1, 1));
      theta /= segments;
      if (tangents[0].dot(vec.crossVectors(normals[0], normals[segments])) > 0) {
        theta = -theta;
      }
      for (let i = 1; i <= segments; i++) {
        normals[i].applyMatrix4(mat.makeRotationAxis(tangents[i], theta * i));
        binormals[i].crossVectors(tangents[i], normals[i]);
      }
    }
    return {
      tangents,
      normals,
      binormals
    };
  }
  /**
   * Returns a new curve with copied values from this instance.
   *
   * @return {Curve} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given curve to this instance.
   *
   * @param {Curve} source - The curve to copy.
   * @return {Curve} A reference to this curve.
   */
  copy(source2) {
    this.arcLengthDivisions = source2.arcLengthDivisions;
    return this;
  }
  /**
   * Serializes the curve into JSON.
   *
   * @return {Object} A JSON object representing the serialized curve.
   * @see {@link ObjectLoader#parse}
   */
  toJSON() {
    const data = {
      metadata: {
        version: 4.7,
        type: "Curve",
        generator: "Curve.toJSON"
      }
    };
    data.arcLengthDivisions = this.arcLengthDivisions;
    data.type = this.type;
    return data;
  }
  /**
   * Deserializes the curve from the given JSON.
   *
   * @param {Object} json - The JSON holding the serialized curve.
   * @return {Curve} A reference to this curve.
   */
  fromJSON(json) {
    this.arcLengthDivisions = json.arcLengthDivisions;
    return this;
  }
};
function CubicPoly() {
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  function init(x0, x1, t0, t1) {
    c0 = x0;
    c1 = t0;
    c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
    c3 = 2 * x0 - 2 * x1 + t0 + t1;
  }
  return {
    initCatmullRom: function(x0, x1, x2, x3, tension) {
      init(x1, x2, tension * (x2 - x0), tension * (x3 - x1));
    },
    initNonuniformCatmullRom: function(x0, x1, x2, x3, dt0, dt1, dt2) {
      let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
      let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
      t1 *= dt1;
      t2 *= dt1;
      init(x1, x2, t1, t2);
    },
    calc: function(t) {
      const t2 = t * t;
      const t3 = t2 * t;
      return c0 + c1 * t + c2 * t2 + c3 * t3;
    }
  };
}
var tmp = /* @__PURE__ */ new Vector3();
var px = /* @__PURE__ */ new CubicPoly();
var py = /* @__PURE__ */ new CubicPoly();
var pz = /* @__PURE__ */ new CubicPoly();
var CatmullRomCurve3 = class extends Curve {
  /**
   * Constructs a new Catmull-Rom curve.
   *
   * @param {Array<Vector3>} [points] - An array of 3D points defining the curve.
   * @param {boolean} [closed=false] - Whether the curve is closed or not.
   * @param {('centripetal'|'chordal'|'catmullrom')} [curveType='centripetal'] - The curve type.
   * @param {number} [tension=0.5] - Tension of the curve.
   */
  constructor(points = [], closed = false, curveType = "centripetal", tension = 0.5) {
    super();
    this.isCatmullRomCurve3 = true;
    this.type = "CatmullRomCurve3";
    this.points = points;
    this.closed = closed;
    this.curveType = curveType;
    this.tension = tension;
  }
  /**
   * Returns a point on the curve.
   *
   * @param {number} t - A interpolation factor representing a position on the curve. Must be in the range `[0,1]`.
   * @param {Vector3} [optionalTarget] - The optional target vector the result is written to.
   * @return {Vector3} The position on the curve.
   */
  getPoint(t, optionalTarget = new Vector3()) {
    const point = optionalTarget;
    const points = this.points;
    const l = points.length;
    const p = (l - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    let weight = p - intPoint;
    if (this.closed) {
      intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
    } else if (weight === 0 && intPoint === l - 1) {
      intPoint = l - 2;
      weight = 1;
    }
    let p0, p3;
    if (this.closed || intPoint > 0) {
      p0 = points[(intPoint - 1) % l];
    } else {
      tmp.subVectors(points[0], points[1]).add(points[0]);
      p0 = tmp;
    }
    const p1 = points[intPoint % l];
    const p2 = points[(intPoint + 1) % l];
    if (this.closed || intPoint + 2 < l) {
      p3 = points[(intPoint + 2) % l];
    } else {
      tmp.subVectors(points[l - 1], points[l - 2]).add(points[l - 1]);
      p3 = tmp;
    }
    if (this.curveType === "centripetal" || this.curveType === "chordal") {
      const pow = this.curveType === "chordal" ? 0.5 : 0.25;
      let dt0 = Math.pow(p0.distanceToSquared(p1), pow);
      let dt1 = Math.pow(p1.distanceToSquared(p2), pow);
      let dt2 = Math.pow(p2.distanceToSquared(p3), pow);
      if (dt1 < 1e-4) dt1 = 1;
      if (dt0 < 1e-4) dt0 = dt1;
      if (dt2 < 1e-4) dt2 = dt1;
      px.initNonuniformCatmullRom(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2);
      py.initNonuniformCatmullRom(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2);
      pz.initNonuniformCatmullRom(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2);
    } else if (this.curveType === "catmullrom") {
      px.initCatmullRom(p0.x, p1.x, p2.x, p3.x, this.tension);
      py.initCatmullRom(p0.y, p1.y, p2.y, p3.y, this.tension);
      pz.initCatmullRom(p0.z, p1.z, p2.z, p3.z, this.tension);
    }
    point.set(
      px.calc(weight),
      py.calc(weight),
      pz.calc(weight)
    );
    return point;
  }
  copy(source2) {
    super.copy(source2);
    this.points = [];
    for (let i = 0, l = source2.points.length; i < l; i++) {
      const point = source2.points[i];
      this.points.push(point.clone());
    }
    this.closed = source2.closed;
    this.curveType = source2.curveType;
    this.tension = source2.tension;
    return this;
  }
  toJSON() {
    const data = super.toJSON();
    data.points = [];
    for (let i = 0, l = this.points.length; i < l; i++) {
      const point = this.points[i];
      data.points.push(point.toArray());
    }
    data.closed = this.closed;
    data.curveType = this.curveType;
    data.tension = this.tension;
    return data;
  }
  fromJSON(json) {
    super.fromJSON(json);
    this.points = [];
    for (let i = 0, l = json.points.length; i < l; i++) {
      const point = json.points[i];
      this.points.push(new Vector3().fromArray(point));
    }
    this.closed = json.closed;
    this.curveType = json.curveType;
    this.tension = json.tension;
    return this;
  }
};
function convertArray(array, type) {
  if (!array || array.constructor === type) return array;
  if (typeof type.BYTES_PER_ELEMENT === "number") {
    return new type(array);
  }
  return Array.prototype.slice.call(array);
}
function isTypedArray(object) {
  return ArrayBuffer.isView(object) && !(object instanceof DataView);
}
var Interpolant = class {
  /**
   * Constructs a new interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    this.parameterPositions = parameterPositions;
    this._cachedIndex = 0;
    this.resultBuffer = resultBuffer !== void 0 ? resultBuffer : new sampleValues.constructor(sampleSize);
    this.sampleValues = sampleValues;
    this.valueSize = sampleSize;
    this.settings = null;
    this.DefaultSettings_ = {};
  }
  /**
   * Evaluate the interpolant at position `t`.
   *
   * @param {number} t - The interpolation factor.
   * @return {TypedArray} The result buffer.
   */
  evaluate(t) {
    const pp = this.parameterPositions;
    let i1 = this._cachedIndex, t1 = pp[i1], t0 = pp[i1 - 1];
    validate_interval: {
      seek: {
        let right;
        linear_scan: {
          forward_scan: if (!(t < t1)) {
            for (let giveUpAt = i1 + 2; ; ) {
              if (t1 === void 0) {
                if (t < t0) break forward_scan;
                i1 = pp.length;
                this._cachedIndex = i1;
                return this.copySampleValue_(i1 - 1);
              }
              if (i1 === giveUpAt) break;
              t0 = t1;
              t1 = pp[++i1];
              if (t < t1) {
                break seek;
              }
            }
            right = pp.length;
            break linear_scan;
          }
          if (!(t >= t0)) {
            const t1global = pp[1];
            if (t < t1global) {
              i1 = 2;
              t0 = t1global;
            }
            for (let giveUpAt = i1 - 2; ; ) {
              if (t0 === void 0) {
                this._cachedIndex = 0;
                return this.copySampleValue_(0);
              }
              if (i1 === giveUpAt) break;
              t1 = t0;
              t0 = pp[--i1 - 1];
              if (t >= t0) {
                break seek;
              }
            }
            right = i1;
            i1 = 0;
            break linear_scan;
          }
          break validate_interval;
        }
        while (i1 < right) {
          const mid = i1 + right >>> 1;
          if (t < pp[mid]) {
            right = mid;
          } else {
            i1 = mid + 1;
          }
        }
        t1 = pp[i1];
        t0 = pp[i1 - 1];
        if (t0 === void 0) {
          this._cachedIndex = 0;
          return this.copySampleValue_(0);
        }
        if (t1 === void 0) {
          i1 = pp.length;
          this._cachedIndex = i1;
          return this.copySampleValue_(i1 - 1);
        }
      }
      this._cachedIndex = i1;
      this.intervalChanged_(i1, t0, t1);
    }
    return this.interpolate_(i1, t0, t, t1);
  }
  /**
   * Returns the interpolation settings.
   *
   * @return {Object} The interpolation settings.
   */
  getSettings_() {
    return this.settings || this.DefaultSettings_;
  }
  /**
   * Copies a sample value to the result buffer.
   *
   * @param {number} index - An index into the sample value buffer.
   * @return {TypedArray} The result buffer.
   */
  copySampleValue_(index) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, offset = index * stride;
    for (let i = 0; i !== stride; ++i) {
      result[i] = values[offset + i];
    }
    return result;
  }
  /**
   * Copies a sample value to the result buffer.
   *
   * @abstract
   * @param {number} i1 - An index into the sample value buffer.
   * @param {number} t0 - The previous interpolation factor.
   * @param {number} t - The current interpolation factor.
   * @param {number} t1 - The next interpolation factor.
   * @return {TypedArray} The result buffer.
   */
  interpolate_() {
    throw new Error("call to abstract method");
  }
  /**
   * Optional method that is executed when the interval has changed.
   *
   * @param {number} i1 - An index into the sample value buffer.
   * @param {number} t0 - The previous interpolation factor.
   * @param {number} t - The current interpolation factor.
   */
  intervalChanged_() {
  }
};
var CubicInterpolant = class extends Interpolant {
  /**
   * Constructs a new cubic interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
    this._weightPrev = -0;
    this._offsetPrev = -0;
    this._weightNext = -0;
    this._offsetNext = -0;
    this.DefaultSettings_ = {
      endingStart: ZeroCurvatureEnding,
      endingEnd: ZeroCurvatureEnding
    };
  }
  intervalChanged_(i1, t0, t1) {
    const pp = this.parameterPositions;
    let iPrev = i1 - 2, iNext = i1 + 1, tPrev = pp[iPrev], tNext = pp[iNext];
    if (tPrev === void 0) {
      switch (this.getSettings_().endingStart) {
        case ZeroSlopeEnding:
          iPrev = i1;
          tPrev = 2 * t0 - t1;
          break;
        case WrapAroundEnding:
          iPrev = pp.length - 2;
          tPrev = t0 + pp[iPrev] - pp[iPrev + 1];
          break;
        default:
          iPrev = i1;
          tPrev = t1;
      }
    }
    if (tNext === void 0) {
      switch (this.getSettings_().endingEnd) {
        case ZeroSlopeEnding:
          iNext = i1;
          tNext = 2 * t1 - t0;
          break;
        case WrapAroundEnding:
          iNext = 1;
          tNext = t1 + pp[1] - pp[0];
          break;
        default:
          iNext = i1 - 1;
          tNext = t0;
      }
    }
    const halfDt = (t1 - t0) * 0.5, stride = this.valueSize;
    this._weightPrev = halfDt / (t0 - tPrev);
    this._weightNext = halfDt / (tNext - t1);
    this._offsetPrev = iPrev * stride;
    this._offsetNext = iNext * stride;
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, o1 = i1 * stride, o0 = o1 - stride, oP = this._offsetPrev, oN = this._offsetNext, wP = this._weightPrev, wN = this._weightNext, p = (t - t0) / (t1 - t0), pp = p * p, ppp = pp * p;
    const sP = -wP * ppp + 2 * wP * pp - wP * p;
    const s0 = (1 + wP) * ppp + (-1.5 - 2 * wP) * pp + (-0.5 + wP) * p + 1;
    const s1 = (-1 - wN) * ppp + (1.5 + wN) * pp + 0.5 * p;
    const sN = wN * ppp - wN * pp;
    for (let i = 0; i !== stride; ++i) {
      result[i] = sP * values[oP + i] + s0 * values[o0 + i] + s1 * values[o1 + i] + sN * values[oN + i];
    }
    return result;
  }
};
var LinearInterpolant = class extends Interpolant {
  /**
   * Constructs a new linear interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, offset1 = i1 * stride, offset0 = offset1 - stride, weight1 = (t - t0) / (t1 - t0), weight0 = 1 - weight1;
    for (let i = 0; i !== stride; ++i) {
      result[i] = values[offset0 + i] * weight0 + values[offset1 + i] * weight1;
    }
    return result;
  }
};
var DiscreteInterpolant = class extends Interpolant {
  /**
   * Constructs a new discrete interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1) {
    return this.copySampleValue_(i1 - 1);
  }
};
var KeyframeTrack = class {
  /**
   * Constructs a new keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number|string|boolean>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    if (name === void 0) throw new Error("THREE.KeyframeTrack: track name is undefined");
    if (times === void 0 || times.length === 0) throw new Error("THREE.KeyframeTrack: no keyframes in track named " + name);
    this.name = name;
    this.times = convertArray(times, this.TimeBufferType);
    this.values = convertArray(values, this.ValueBufferType);
    this.setInterpolation(interpolation || this.DefaultInterpolation);
  }
  /**
   * Converts the keyframe track to JSON.
   *
   * @static
   * @param {KeyframeTrack} track - The keyframe track to serialize.
   * @return {Object} The serialized keyframe track as JSON.
   */
  static toJSON(track) {
    const trackType = track.constructor;
    let json;
    if (trackType.toJSON !== this.toJSON) {
      json = trackType.toJSON(track);
    } else {
      json = {
        "name": track.name,
        "times": convertArray(track.times, Array),
        "values": convertArray(track.values, Array)
      };
      const interpolation = track.getInterpolation();
      if (interpolation !== track.DefaultInterpolation) {
        json.interpolation = interpolation;
      }
    }
    json.type = track.ValueTypeName;
    return json;
  }
  /**
   * Factory method for creating a new discrete interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {DiscreteInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodDiscrete(result) {
    return new DiscreteInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  /**
   * Factory method for creating a new linear interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {LinearInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodLinear(result) {
    return new LinearInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  /**
   * Factory method for creating a new smooth interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {CubicInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodSmooth(result) {
    return new CubicInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  /**
   * Defines the interpolation factor method for this keyframe track.
   *
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} interpolation - The interpolation type.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  setInterpolation(interpolation) {
    let factoryMethod;
    switch (interpolation) {
      case InterpolateDiscrete:
        factoryMethod = this.InterpolantFactoryMethodDiscrete;
        break;
      case InterpolateLinear:
        factoryMethod = this.InterpolantFactoryMethodLinear;
        break;
      case InterpolateSmooth:
        factoryMethod = this.InterpolantFactoryMethodSmooth;
        break;
    }
    if (factoryMethod === void 0) {
      const message = "unsupported interpolation for " + this.ValueTypeName + " keyframe track named " + this.name;
      if (this.createInterpolant === void 0) {
        if (interpolation !== this.DefaultInterpolation) {
          this.setInterpolation(this.DefaultInterpolation);
        } else {
          throw new Error(message);
        }
      }
      console.warn("THREE.KeyframeTrack:", message);
      return this;
    }
    this.createInterpolant = factoryMethod;
    return this;
  }
  /**
   * Returns the current interpolation type.
   *
   * @return {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} The interpolation type.
   */
  getInterpolation() {
    switch (this.createInterpolant) {
      case this.InterpolantFactoryMethodDiscrete:
        return InterpolateDiscrete;
      case this.InterpolantFactoryMethodLinear:
        return InterpolateLinear;
      case this.InterpolantFactoryMethodSmooth:
        return InterpolateSmooth;
    }
  }
  /**
   * Returns the value size.
   *
   * @return {number} The value size.
   */
  getValueSize() {
    return this.values.length / this.times.length;
  }
  /**
   * Moves all keyframes either forward or backward in time.
   *
   * @param {number} timeOffset - The offset to move the time values.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  shift(timeOffset) {
    if (timeOffset !== 0) {
      const times = this.times;
      for (let i = 0, n = times.length; i !== n; ++i) {
        times[i] += timeOffset;
      }
    }
    return this;
  }
  /**
   * Scale all keyframe times by a factor (useful for frame - seconds conversions).
   *
   * @param {number} timeScale - The time scale.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  scale(timeScale) {
    if (timeScale !== 1) {
      const times = this.times;
      for (let i = 0, n = times.length; i !== n; ++i) {
        times[i] *= timeScale;
      }
    }
    return this;
  }
  /**
   * Removes keyframes before and after animation without changing any values within the defined time range.
   *
   * Note: The method does not shift around keys to the start of the track time, because for interpolated
   * keys this will change their values
   *
   * @param {number} startTime - The start time.
   * @param {number} endTime - The end time.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  trim(startTime, endTime) {
    const times = this.times, nKeys = times.length;
    let from = 0, to = nKeys - 1;
    while (from !== nKeys && times[from] < startTime) {
      ++from;
    }
    while (to !== -1 && times[to] > endTime) {
      --to;
    }
    ++to;
    if (from !== 0 || to !== nKeys) {
      if (from >= to) {
        to = Math.max(to, 1);
        from = to - 1;
      }
      const stride = this.getValueSize();
      this.times = times.slice(from, to);
      this.values = this.values.slice(from * stride, to * stride);
    }
    return this;
  }
  /**
   * Performs minimal validation on the keyframe track. Returns `true` if the values
   * are valid.
   *
   * @return {boolean} Whether the keyframes are valid or not.
   */
  validate() {
    let valid = true;
    const valueSize = this.getValueSize();
    if (valueSize - Math.floor(valueSize) !== 0) {
      console.error("THREE.KeyframeTrack: Invalid value size in track.", this);
      valid = false;
    }
    const times = this.times, values = this.values, nKeys = times.length;
    if (nKeys === 0) {
      console.error("THREE.KeyframeTrack: Track is empty.", this);
      valid = false;
    }
    let prevTime = null;
    for (let i = 0; i !== nKeys; i++) {
      const currTime = times[i];
      if (typeof currTime === "number" && isNaN(currTime)) {
        console.error("THREE.KeyframeTrack: Time is not a valid number.", this, i, currTime);
        valid = false;
        break;
      }
      if (prevTime !== null && prevTime > currTime) {
        console.error("THREE.KeyframeTrack: Out of order keys.", this, i, currTime, prevTime);
        valid = false;
        break;
      }
      prevTime = currTime;
    }
    if (values !== void 0) {
      if (isTypedArray(values)) {
        for (let i = 0, n = values.length; i !== n; ++i) {
          const value = values[i];
          if (isNaN(value)) {
            console.error("THREE.KeyframeTrack: Value is not a valid number.", this, i, value);
            valid = false;
            break;
          }
        }
      }
    }
    return valid;
  }
  /**
   * Optimizes this keyframe track by removing equivalent sequential keys (which are
   * common in morph target sequences).
   *
   * @return {AnimationClip} A reference to this animation clip.
   */
  optimize() {
    const times = this.times.slice(), values = this.values.slice(), stride = this.getValueSize(), smoothInterpolation = this.getInterpolation() === InterpolateSmooth, lastIndex = times.length - 1;
    let writeIndex = 1;
    for (let i = 1; i < lastIndex; ++i) {
      let keep = false;
      const time = times[i];
      const timeNext = times[i + 1];
      if (time !== timeNext && (i !== 1 || time !== times[0])) {
        if (!smoothInterpolation) {
          const offset = i * stride, offsetP = offset - stride, offsetN = offset + stride;
          for (let j = 0; j !== stride; ++j) {
            const value = values[offset + j];
            if (value !== values[offsetP + j] || value !== values[offsetN + j]) {
              keep = true;
              break;
            }
          }
        } else {
          keep = true;
        }
      }
      if (keep) {
        if (i !== writeIndex) {
          times[writeIndex] = times[i];
          const readOffset = i * stride, writeOffset = writeIndex * stride;
          for (let j = 0; j !== stride; ++j) {
            values[writeOffset + j] = values[readOffset + j];
          }
        }
        ++writeIndex;
      }
    }
    if (lastIndex > 0) {
      times[writeIndex] = times[lastIndex];
      for (let readOffset = lastIndex * stride, writeOffset = writeIndex * stride, j = 0; j !== stride; ++j) {
        values[writeOffset + j] = values[readOffset + j];
      }
      ++writeIndex;
    }
    if (writeIndex !== times.length) {
      this.times = times.slice(0, writeIndex);
      this.values = values.slice(0, writeIndex * stride);
    } else {
      this.times = times;
      this.values = values;
    }
    return this;
  }
  /**
   * Returns a new keyframe track with copied values from this instance.
   *
   * @return {KeyframeTrack} A clone of this instance.
   */
  clone() {
    const times = this.times.slice();
    const values = this.values.slice();
    const TypedKeyframeTrack = this.constructor;
    const track = new TypedKeyframeTrack(this.name, times, values);
    track.createInterpolant = this.createInterpolant;
    return track;
  }
};
KeyframeTrack.prototype.ValueTypeName = "";
KeyframeTrack.prototype.TimeBufferType = Float32Array;
KeyframeTrack.prototype.ValueBufferType = Float32Array;
KeyframeTrack.prototype.DefaultInterpolation = InterpolateLinear;
var BooleanKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new boolean keyframe track.
   *
   * This keyframe track type has no `interpolation` parameter because the
   * interpolation is always discrete.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<boolean>} values - A list of keyframe values.
   */
  constructor(name, times, values) {
    super(name, times, values);
  }
};
BooleanKeyframeTrack.prototype.ValueTypeName = "bool";
BooleanKeyframeTrack.prototype.ValueBufferType = Array;
BooleanKeyframeTrack.prototype.DefaultInterpolation = InterpolateDiscrete;
BooleanKeyframeTrack.prototype.InterpolantFactoryMethodLinear = void 0;
BooleanKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var ColorKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new color keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
};
ColorKeyframeTrack.prototype.ValueTypeName = "color";
var NumberKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new number keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
};
NumberKeyframeTrack.prototype.ValueTypeName = "number";
var QuaternionLinearInterpolant = class extends Interpolant {
  /**
   * Constructs a new SLERP interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, alpha = (t - t0) / (t1 - t0);
    let offset = i1 * stride;
    for (let end = offset + stride; offset !== end; offset += 4) {
      Quaternion.slerpFlat(result, 0, values, offset - stride, values, offset, alpha);
    }
    return result;
  }
};
var QuaternionKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new Quaternion keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
  /**
   * Overwritten so the method returns Quaternion based interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {QuaternionLinearInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodLinear(result) {
    return new QuaternionLinearInterpolant(this.times, this.values, this.getValueSize(), result);
  }
};
QuaternionKeyframeTrack.prototype.ValueTypeName = "quaternion";
QuaternionKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var StringKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new string keyframe track.
   *
   * This keyframe track type has no `interpolation` parameter because the
   * interpolation is always discrete.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<string>} values - A list of keyframe values.
   */
  constructor(name, times, values) {
    super(name, times, values);
  }
};
StringKeyframeTrack.prototype.ValueTypeName = "string";
StringKeyframeTrack.prototype.ValueBufferType = Array;
StringKeyframeTrack.prototype.DefaultInterpolation = InterpolateDiscrete;
StringKeyframeTrack.prototype.InterpolantFactoryMethodLinear = void 0;
StringKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var VectorKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new vector keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
};
VectorKeyframeTrack.prototype.ValueTypeName = "vector";
var LoadingManager = class {
  /**
   * Constructs a new loading manager.
   *
   * @param {Function} [onLoad] - Executes when all items have been loaded.
   * @param {Function} [onProgress] - Executes when single items have been loaded.
   * @param {Function} [onError] - Executes when an error occurs.
   */
  constructor(onLoad, onProgress, onError) {
    const scope = this;
    let isLoading = false;
    let itemsLoaded = 0;
    let itemsTotal = 0;
    let urlModifier = void 0;
    const handlers = [];
    this.onStart = void 0;
    this.onLoad = onLoad;
    this.onProgress = onProgress;
    this.onError = onError;
    this.abortController = new AbortController();
    this.itemStart = function(url) {
      itemsTotal++;
      if (isLoading === false) {
        if (scope.onStart !== void 0) {
          scope.onStart(url, itemsLoaded, itemsTotal);
        }
      }
      isLoading = true;
    };
    this.itemEnd = function(url) {
      itemsLoaded++;
      if (scope.onProgress !== void 0) {
        scope.onProgress(url, itemsLoaded, itemsTotal);
      }
      if (itemsLoaded === itemsTotal) {
        isLoading = false;
        if (scope.onLoad !== void 0) {
          scope.onLoad();
        }
      }
    };
    this.itemError = function(url) {
      if (scope.onError !== void 0) {
        scope.onError(url);
      }
    };
    this.resolveURL = function(url) {
      if (urlModifier) {
        return urlModifier(url);
      }
      return url;
    };
    this.setURLModifier = function(transform) {
      urlModifier = transform;
      return this;
    };
    this.addHandler = function(regex, loader) {
      handlers.push(regex, loader);
      return this;
    };
    this.removeHandler = function(regex) {
      const index = handlers.indexOf(regex);
      if (index !== -1) {
        handlers.splice(index, 2);
      }
      return this;
    };
    this.getHandler = function(file) {
      for (let i = 0, l = handlers.length; i < l; i += 2) {
        const regex = handlers[i];
        const loader = handlers[i + 1];
        if (regex.global) regex.lastIndex = 0;
        if (regex.test(file)) {
          return loader;
        }
      }
      return null;
    };
    this.abort = function() {
      this.abortController.abort();
      this.abortController = new AbortController();
      return this;
    };
  }
};
var DefaultLoadingManager = /* @__PURE__ */ new LoadingManager();
var Loader = class {
  /**
   * Constructs a new loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    this.manager = manager !== void 0 ? manager : DefaultLoadingManager;
    this.crossOrigin = "anonymous";
    this.withCredentials = false;
    this.path = "";
    this.resourcePath = "";
    this.requestHeader = {};
  }
  /**
   * This method needs to be implemented by all concrete loaders. It holds the
   * logic for loading assets from the backend.
   *
   * @abstract
   * @param {string} url - The path/URL of the file to be loaded.
   * @param {Function} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @param {onErrorCallback} [onError] - Executed when errors occur.
   */
  load() {
  }
  /**
   * A async version of {@link Loader#load}.
   *
   * @param {string} url - The path/URL of the file to be loaded.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @return {Promise} A Promise that resolves when the asset has been loaded.
   */
  loadAsync(url, onProgress) {
    const scope = this;
    return new Promise(function(resolve, reject) {
      scope.load(url, resolve, onProgress, reject);
    });
  }
  /**
   * This method needs to be implemented by all concrete loaders. It holds the
   * logic for parsing the asset into three.js entities.
   *
   * @abstract
   * @param {any} data - The data to parse.
   */
  parse() {
  }
  /**
   * Sets the `crossOrigin` String to implement CORS for loading the URL
   * from a different domain that allows CORS.
   *
   * @param {string} crossOrigin - The `crossOrigin` value.
   * @return {Loader} A reference to this instance.
   */
  setCrossOrigin(crossOrigin) {
    this.crossOrigin = crossOrigin;
    return this;
  }
  /**
   * Whether the XMLHttpRequest uses credentials such as cookies, authorization
   * headers or TLS client certificates, see [XMLHttpRequest.withCredentials]{@link https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials}.
   *
   * Note: This setting has no effect if you are loading files locally or from the same domain.
   *
   * @param {boolean} value - The `withCredentials` value.
   * @return {Loader} A reference to this instance.
   */
  setWithCredentials(value) {
    this.withCredentials = value;
    return this;
  }
  /**
   * Sets the base path for the asset.
   *
   * @param {string} path - The base path.
   * @return {Loader} A reference to this instance.
   */
  setPath(path) {
    this.path = path;
    return this;
  }
  /**
   * Sets the base path for dependent resources like textures.
   *
   * @param {string} resourcePath - The resource path.
   * @return {Loader} A reference to this instance.
   */
  setResourcePath(resourcePath) {
    this.resourcePath = resourcePath;
    return this;
  }
  /**
   * Sets the given request header.
   *
   * @param {Object} requestHeader - A [request header]{@link https://developer.mozilla.org/en-US/docs/Glossary/Request_header}
   * for configuring the HTTP request.
   * @return {Loader} A reference to this instance.
   */
  setRequestHeader(requestHeader) {
    this.requestHeader = requestHeader;
    return this;
  }
  /**
   * This method can be implemented in loaders for aborting ongoing requests.
   *
   * @abstract
   * @return {Loader} A reference to this instance.
   */
  abort() {
    return this;
  }
};
Loader.DEFAULT_MATERIAL_NAME = "__DEFAULT";
var _RESERVED_CHARS_RE = "\\[\\]\\.:\\/";
var _reservedRe = new RegExp("[" + _RESERVED_CHARS_RE + "]", "g");
var _wordChar = "[^" + _RESERVED_CHARS_RE + "]";
var _wordCharOrDot = "[^" + _RESERVED_CHARS_RE.replace("\\.", "") + "]";
var _directoryRe = /* @__PURE__ */ /((?:WC+[\/:])*)/.source.replace("WC", _wordChar);
var _nodeRe = /* @__PURE__ */ /(WCOD+)?/.source.replace("WCOD", _wordCharOrDot);
var _objectRe = /* @__PURE__ */ /(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC", _wordChar);
var _propertyRe = /* @__PURE__ */ /\.(WC+)(?:\[(.+)\])?/.source.replace("WC", _wordChar);
var _trackRe = new RegExp(
  "^" + _directoryRe + _nodeRe + _objectRe + _propertyRe + "$"
);
var _supportedObjectNames = ["material", "materials", "bones", "map"];
var Composite = class {
  constructor(targetGroup, path, optionalParsedPath) {
    const parsedPath = optionalParsedPath || PropertyBinding.parseTrackName(path);
    this._targetGroup = targetGroup;
    this._bindings = targetGroup.subscribe_(path, parsedPath);
  }
  getValue(array, offset) {
    this.bind();
    const firstValidIndex = this._targetGroup.nCachedObjects_, binding = this._bindings[firstValidIndex];
    if (binding !== void 0) binding.getValue(array, offset);
  }
  setValue(array, offset) {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].setValue(array, offset);
    }
  }
  bind() {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].bind();
    }
  }
  unbind() {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].unbind();
    }
  }
};
var PropertyBinding = class _PropertyBinding {
  /**
   * Constructs a new property binding.
   *
   * @param {Object} rootNode - The root node.
   * @param {string} path - The path.
   * @param {?Object} [parsedPath] - The parsed path.
   */
  constructor(rootNode, path, parsedPath) {
    this.path = path;
    this.parsedPath = parsedPath || _PropertyBinding.parseTrackName(path);
    this.node = _PropertyBinding.findNode(rootNode, this.parsedPath.nodeName);
    this.rootNode = rootNode;
    this.getValue = this._getValue_unbound;
    this.setValue = this._setValue_unbound;
  }
  /**
   * Factory method for creating a property binding from the given parameters.
   *
   * @static
   * @param {Object} root - The root node.
   * @param {string} path - The path.
   * @param {?Object} [parsedPath] - The parsed path.
   * @return {PropertyBinding|Composite} The created property binding or composite.
   */
  static create(root, path, parsedPath) {
    if (!(root && root.isAnimationObjectGroup)) {
      return new _PropertyBinding(root, path, parsedPath);
    } else {
      return new _PropertyBinding.Composite(root, path, parsedPath);
    }
  }
  /**
   * Replaces spaces with underscores and removes unsupported characters from
   * node names, to ensure compatibility with parseTrackName().
   *
   * @param {string} name - Node name to be sanitized.
   * @return {string} The sanitized node name.
   */
  static sanitizeNodeName(name) {
    return name.replace(/\s/g, "_").replace(_reservedRe, "");
  }
  /**
   * Parses the given track name (an object path to an animated property) and
   * returns an object with information about the path. Matches strings in the following forms:
   *
   * - nodeName.property
   * - nodeName.property[accessor]
   * - nodeName.material.property[accessor]
   * - uuid.property[accessor]
   * - uuid.objectName[objectIndex].propertyName[propertyIndex]
   * - parentName/nodeName.property
   * - parentName/parentName/nodeName.property[index]
   * - .bone[Armature.DEF_cog].position
   * - scene:helium_balloon_model:helium_balloon_model.position
   *
   * @static
   * @param {string} trackName - The track name to parse.
   * @return {Object} The parsed track name as an object.
   */
  static parseTrackName(trackName) {
    const matches = _trackRe.exec(trackName);
    if (matches === null) {
      throw new Error("PropertyBinding: Cannot parse trackName: " + trackName);
    }
    const results = {
      // directoryName: matches[ 1 ], // (tschw) currently unused
      nodeName: matches[2],
      objectName: matches[3],
      objectIndex: matches[4],
      propertyName: matches[5],
      // required
      propertyIndex: matches[6]
    };
    const lastDot = results.nodeName && results.nodeName.lastIndexOf(".");
    if (lastDot !== void 0 && lastDot !== -1) {
      const objectName = results.nodeName.substring(lastDot + 1);
      if (_supportedObjectNames.indexOf(objectName) !== -1) {
        results.nodeName = results.nodeName.substring(0, lastDot);
        results.objectName = objectName;
      }
    }
    if (results.propertyName === null || results.propertyName.length === 0) {
      throw new Error("PropertyBinding: can not parse propertyName from trackName: " + trackName);
    }
    return results;
  }
  /**
   * Searches for a node in the hierarchy of the given root object by the given
   * node name.
   *
   * @static
   * @param {Object} root - The root object.
   * @param {string|number} nodeName - The name of the node.
   * @return {?Object} The found node. Returns `null` if no object was found.
   */
  static findNode(root, nodeName) {
    if (nodeName === void 0 || nodeName === "" || nodeName === "." || nodeName === -1 || nodeName === root.name || nodeName === root.uuid) {
      return root;
    }
    if (root.skeleton) {
      const bone = root.skeleton.getBoneByName(nodeName);
      if (bone !== void 0) {
        return bone;
      }
    }
    if (root.children) {
      const searchNodeSubtree = function(children) {
        for (let i = 0; i < children.length; i++) {
          const childNode = children[i];
          if (childNode.name === nodeName || childNode.uuid === nodeName) {
            return childNode;
          }
          const result = searchNodeSubtree(childNode.children);
          if (result) return result;
        }
        return null;
      };
      const subTreeNode = searchNodeSubtree(root.children);
      if (subTreeNode) {
        return subTreeNode;
      }
    }
    return null;
  }
  // these are used to "bind" a nonexistent property
  _getValue_unavailable() {
  }
  _setValue_unavailable() {
  }
  // Getters
  _getValue_direct(buffer, offset) {
    buffer[offset] = this.targetObject[this.propertyName];
  }
  _getValue_array(buffer, offset) {
    const source2 = this.resolvedProperty;
    for (let i = 0, n = source2.length; i !== n; ++i) {
      buffer[offset++] = source2[i];
    }
  }
  _getValue_arrayElement(buffer, offset) {
    buffer[offset] = this.resolvedProperty[this.propertyIndex];
  }
  _getValue_toArray(buffer, offset) {
    this.resolvedProperty.toArray(buffer, offset);
  }
  // Direct
  _setValue_direct(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
  }
  _setValue_direct_setNeedsUpdate(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
    this.targetObject.needsUpdate = true;
  }
  _setValue_direct_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // EntireArray
  _setValue_array(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
  }
  _setValue_array_setNeedsUpdate(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
    this.targetObject.needsUpdate = true;
  }
  _setValue_array_setMatrixWorldNeedsUpdate(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // ArrayElement
  _setValue_arrayElement(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
  }
  _setValue_arrayElement_setNeedsUpdate(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
    this.targetObject.needsUpdate = true;
  }
  _setValue_arrayElement_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // HasToFromArray
  _setValue_fromArray(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
  }
  _setValue_fromArray_setNeedsUpdate(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
    this.targetObject.needsUpdate = true;
  }
  _setValue_fromArray_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  _getValue_unbound(targetArray, offset) {
    this.bind();
    this.getValue(targetArray, offset);
  }
  _setValue_unbound(sourceArray, offset) {
    this.bind();
    this.setValue(sourceArray, offset);
  }
  /**
   * Creates a getter / setter pair for the property tracked by this binding.
   */
  bind() {
    let targetObject = this.node;
    const parsedPath = this.parsedPath;
    const objectName = parsedPath.objectName;
    const propertyName = parsedPath.propertyName;
    let propertyIndex = parsedPath.propertyIndex;
    if (!targetObject) {
      targetObject = _PropertyBinding.findNode(this.rootNode, parsedPath.nodeName);
      this.node = targetObject;
    }
    this.getValue = this._getValue_unavailable;
    this.setValue = this._setValue_unavailable;
    if (!targetObject) {
      console.warn("THREE.PropertyBinding: No target node found for track: " + this.path + ".");
      return;
    }
    if (objectName) {
      let objectIndex = parsedPath.objectIndex;
      switch (objectName) {
        case "materials":
          if (!targetObject.material) {
            console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!targetObject.material.materials) {
            console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.", this);
            return;
          }
          targetObject = targetObject.material.materials;
          break;
        case "bones":
          if (!targetObject.skeleton) {
            console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.", this);
            return;
          }
          targetObject = targetObject.skeleton.bones;
          for (let i = 0; i < targetObject.length; i++) {
            if (targetObject[i].name === objectIndex) {
              objectIndex = i;
              break;
            }
          }
          break;
        case "map":
          if ("map" in targetObject) {
            targetObject = targetObject.map;
            break;
          }
          if (!targetObject.material) {
            console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!targetObject.material.map) {
            console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.", this);
            return;
          }
          targetObject = targetObject.material.map;
          break;
        default:
          if (targetObject[objectName] === void 0) {
            console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.", this);
            return;
          }
          targetObject = targetObject[objectName];
      }
      if (objectIndex !== void 0) {
        if (targetObject[objectIndex] === void 0) {
          console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.", this, targetObject);
          return;
        }
        targetObject = targetObject[objectIndex];
      }
    }
    const nodeProperty = targetObject[propertyName];
    if (nodeProperty === void 0) {
      const nodeName = parsedPath.nodeName;
      console.error("THREE.PropertyBinding: Trying to update property for track: " + nodeName + "." + propertyName + " but it wasn't found.", targetObject);
      return;
    }
    let versioning = this.Versioning.None;
    this.targetObject = targetObject;
    if (targetObject.isMaterial === true) {
      versioning = this.Versioning.NeedsUpdate;
    } else if (targetObject.isObject3D === true) {
      versioning = this.Versioning.MatrixWorldNeedsUpdate;
    }
    let bindingType = this.BindingType.Direct;
    if (propertyIndex !== void 0) {
      if (propertyName === "morphTargetInfluences") {
        if (!targetObject.geometry) {
          console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.", this);
          return;
        }
        if (!targetObject.geometry.morphAttributes) {
          console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.", this);
          return;
        }
        if (targetObject.morphTargetDictionary[propertyIndex] !== void 0) {
          propertyIndex = targetObject.morphTargetDictionary[propertyIndex];
        }
      }
      bindingType = this.BindingType.ArrayElement;
      this.resolvedProperty = nodeProperty;
      this.propertyIndex = propertyIndex;
    } else if (nodeProperty.fromArray !== void 0 && nodeProperty.toArray !== void 0) {
      bindingType = this.BindingType.HasFromToArray;
      this.resolvedProperty = nodeProperty;
    } else if (Array.isArray(nodeProperty)) {
      bindingType = this.BindingType.EntireArray;
      this.resolvedProperty = nodeProperty;
    } else {
      this.propertyName = propertyName;
    }
    this.getValue = this.GetterByBindingType[bindingType];
    this.setValue = this.SetterByBindingTypeAndVersioning[bindingType][versioning];
  }
  /**
   * Unbinds the property.
   */
  unbind() {
    this.node = null;
    this.getValue = this._getValue_unbound;
    this.setValue = this._setValue_unbound;
  }
};
PropertyBinding.Composite = Composite;
PropertyBinding.prototype.BindingType = {
  Direct: 0,
  EntireArray: 1,
  ArrayElement: 2,
  HasFromToArray: 3
};
PropertyBinding.prototype.Versioning = {
  None: 0,
  NeedsUpdate: 1,
  MatrixWorldNeedsUpdate: 2
};
PropertyBinding.prototype.GetterByBindingType = [
  PropertyBinding.prototype._getValue_direct,
  PropertyBinding.prototype._getValue_array,
  PropertyBinding.prototype._getValue_arrayElement,
  PropertyBinding.prototype._getValue_toArray
];
PropertyBinding.prototype.SetterByBindingTypeAndVersioning = [
  [
    // Direct
    PropertyBinding.prototype._setValue_direct,
    PropertyBinding.prototype._setValue_direct_setNeedsUpdate,
    PropertyBinding.prototype._setValue_direct_setMatrixWorldNeedsUpdate
  ],
  [
    // EntireArray
    PropertyBinding.prototype._setValue_array,
    PropertyBinding.prototype._setValue_array_setNeedsUpdate,
    PropertyBinding.prototype._setValue_array_setMatrixWorldNeedsUpdate
  ],
  [
    // ArrayElement
    PropertyBinding.prototype._setValue_arrayElement,
    PropertyBinding.prototype._setValue_arrayElement_setNeedsUpdate,
    PropertyBinding.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate
  ],
  [
    // HasToFromArray
    PropertyBinding.prototype._setValue_fromArray,
    PropertyBinding.prototype._setValue_fromArray_setNeedsUpdate,
    PropertyBinding.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate
  ]
];
var _controlInterpolantsResultBuffer = new Float32Array(1);
if (typeof __THREE_DEVTOOLS__ !== "undefined") {
  __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register", { detail: {
    revision: REVISION
  } }));
}
if (typeof window !== "undefined") {
  if (window.__THREE__) {
    console.warn("WARNING: Multiple instances of Three.js being imported.");
  } else {
    window.__THREE__ = REVISION;
  }
}

// node_modules/.pnpm/three@0.180.0/node_modules/three/build/three.module.js
var alphahash_fragment = "#ifdef USE_ALPHAHASH\n	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;\n#endif";
var alphahash_pars_fragment = "#ifdef USE_ALPHAHASH\n	const float ALPHA_HASH_SCALE = 0.05;\n	float hash2D( vec2 value ) {\n		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );\n	}\n	float hash3D( vec3 value ) {\n		return hash2D( vec2( hash2D( value.xy ), value.z ) );\n	}\n	float getAlphaHashThreshold( vec3 position ) {\n		float maxDeriv = max(\n			length( dFdx( position.xyz ) ),\n			length( dFdy( position.xyz ) )\n		);\n		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );\n		vec2 pixScales = vec2(\n			exp2( floor( log2( pixScale ) ) ),\n			exp2( ceil( log2( pixScale ) ) )\n		);\n		vec2 alpha = vec2(\n			hash3D( floor( pixScales.x * position.xyz ) ),\n			hash3D( floor( pixScales.y * position.xyz ) )\n		);\n		float lerpFactor = fract( log2( pixScale ) );\n		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;\n		float a = min( lerpFactor, 1.0 - lerpFactor );\n		vec3 cases = vec3(\n			x * x / ( 2.0 * a * ( 1.0 - a ) ),\n			( x - 0.5 * a ) / ( 1.0 - a ),\n			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )\n		);\n		float threshold = ( x < ( 1.0 - a ) )\n			? ( ( x < a ) ? cases.x : cases.y )\n			: cases.z;\n		return clamp( threshold , 1.0e-6, 1.0 );\n	}\n#endif";
var alphamap_fragment = "#ifdef USE_ALPHAMAP\n	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;\n#endif";
var alphamap_pars_fragment = "#ifdef USE_ALPHAMAP\n	uniform sampler2D alphaMap;\n#endif";
var alphatest_fragment = "#ifdef USE_ALPHATEST\n	#ifdef ALPHA_TO_COVERAGE\n	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );\n	if ( diffuseColor.a == 0.0 ) discard;\n	#else\n	if ( diffuseColor.a < alphaTest ) discard;\n	#endif\n#endif";
var alphatest_pars_fragment = "#ifdef USE_ALPHATEST\n	uniform float alphaTest;\n#endif";
var aomap_fragment = "#ifdef USE_AOMAP\n	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;\n	reflectedLight.indirectDiffuse *= ambientOcclusion;\n	#if defined( USE_CLEARCOAT ) \n		clearcoatSpecularIndirect *= ambientOcclusion;\n	#endif\n	#if defined( USE_SHEEN ) \n		sheenSpecularIndirect *= ambientOcclusion;\n	#endif\n	#if defined( USE_ENVMAP ) && defined( STANDARD )\n		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );\n		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );\n	#endif\n#endif";
var aomap_pars_fragment = "#ifdef USE_AOMAP\n	uniform sampler2D aoMap;\n	uniform float aoMapIntensity;\n#endif";
var batching_pars_vertex = "#ifdef USE_BATCHING\n	#if ! defined( GL_ANGLE_multi_draw )\n	#define gl_DrawID _gl_DrawID\n	uniform int _gl_DrawID;\n	#endif\n	uniform highp sampler2D batchingTexture;\n	uniform highp usampler2D batchingIdTexture;\n	mat4 getBatchingMatrix( const in float i ) {\n		int size = textureSize( batchingTexture, 0 ).x;\n		int j = int( i ) * 4;\n		int x = j % size;\n		int y = j / size;\n		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );\n		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );\n		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );\n		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );\n		return mat4( v1, v2, v3, v4 );\n	}\n	float getIndirectIndex( const in int i ) {\n		int size = textureSize( batchingIdTexture, 0 ).x;\n		int x = i % size;\n		int y = i / size;\n		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );\n	}\n#endif\n#ifdef USE_BATCHING_COLOR\n	uniform sampler2D batchingColorTexture;\n	vec3 getBatchingColor( const in float i ) {\n		int size = textureSize( batchingColorTexture, 0 ).x;\n		int j = int( i );\n		int x = j % size;\n		int y = j / size;\n		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;\n	}\n#endif";
var batching_vertex = "#ifdef USE_BATCHING\n	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );\n#endif";
var begin_vertex = "vec3 transformed = vec3( position );\n#ifdef USE_ALPHAHASH\n	vPosition = vec3( position );\n#endif";
var beginnormal_vertex = "vec3 objectNormal = vec3( normal );\n#ifdef USE_TANGENT\n	vec3 objectTangent = vec3( tangent.xyz );\n#endif";
var bsdfs = "float G_BlinnPhong_Implicit( ) {\n	return 0.25;\n}\nfloat D_BlinnPhong( const in float shininess, const in float dotNH ) {\n	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );\n}\nvec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float dotVH = saturate( dot( viewDir, halfDir ) );\n	vec3 F = F_Schlick( specularColor, 1.0, dotVH );\n	float G = G_BlinnPhong_Implicit( );\n	float D = D_BlinnPhong( shininess, dotNH );\n	return F * ( G * D );\n} // validated";
var iridescence_fragment = "#ifdef USE_IRIDESCENCE\n	const mat3 XYZ_TO_REC709 = mat3(\n		 3.2404542, -0.9692660,  0.0556434,\n		-1.5371385,  1.8760108, -0.2040259,\n		-0.4985314,  0.0415560,  1.0572252\n	);\n	vec3 Fresnel0ToIor( vec3 fresnel0 ) {\n		vec3 sqrtF0 = sqrt( fresnel0 );\n		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );\n	}\n	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {\n		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );\n	}\n	float IorToFresnel0( float transmittedIor, float incidentIor ) {\n		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));\n	}\n	vec3 evalSensitivity( float OPD, vec3 shift ) {\n		float phase = 2.0 * PI * OPD * 1.0e-9;\n		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );\n		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );\n		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );\n		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );\n		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );\n		xyz /= 1.0685e-7;\n		vec3 rgb = XYZ_TO_REC709 * xyz;\n		return rgb;\n	}\n	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {\n		vec3 I;\n		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );\n		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );\n		float cosTheta2Sq = 1.0 - sinTheta2Sq;\n		if ( cosTheta2Sq < 0.0 ) {\n			return vec3( 1.0 );\n		}\n		float cosTheta2 = sqrt( cosTheta2Sq );\n		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );\n		float R12 = F_Schlick( R0, 1.0, cosTheta1 );\n		float T121 = 1.0 - R12;\n		float phi12 = 0.0;\n		if ( iridescenceIOR < outsideIOR ) phi12 = PI;\n		float phi21 = PI - phi12;\n		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );\n		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );\n		vec3 phi23 = vec3( 0.0 );\n		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;\n		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;\n		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;\n		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;\n		vec3 phi = vec3( phi21 ) + phi23;\n		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );\n		vec3 r123 = sqrt( R123 );\n		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );\n		vec3 C0 = R12 + Rs;\n		I = C0;\n		vec3 Cm = Rs - T121;\n		for ( int m = 1; m <= 2; ++ m ) {\n			Cm *= r123;\n			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );\n			I += Cm * Sm;\n		}\n		return max( I, vec3( 0.0 ) );\n	}\n#endif";
var bumpmap_pars_fragment = "#ifdef USE_BUMPMAP\n	uniform sampler2D bumpMap;\n	uniform float bumpScale;\n	vec2 dHdxy_fwd() {\n		vec2 dSTdx = dFdx( vBumpMapUv );\n		vec2 dSTdy = dFdy( vBumpMapUv );\n		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;\n		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;\n		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;\n		return vec2( dBx, dBy );\n	}\n	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {\n		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );\n		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );\n		vec3 vN = surf_norm;\n		vec3 R1 = cross( vSigmaY, vN );\n		vec3 R2 = cross( vN, vSigmaX );\n		float fDet = dot( vSigmaX, R1 ) * faceDirection;\n		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\n		return normalize( abs( fDet ) * surf_norm - vGrad );\n	}\n#endif";
var clipping_planes_fragment = "#if NUM_CLIPPING_PLANES > 0\n	vec4 plane;\n	#ifdef ALPHA_TO_COVERAGE\n		float distanceToPlane, distanceGradient;\n		float clipOpacity = 1.0;\n		#pragma unroll_loop_start\n		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {\n			plane = clippingPlanes[ i ];\n			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;\n			distanceGradient = fwidth( distanceToPlane ) / 2.0;\n			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );\n			if ( clipOpacity == 0.0 ) discard;\n		}\n		#pragma unroll_loop_end\n		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES\n			float unionClipOpacity = 1.0;\n			#pragma unroll_loop_start\n			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {\n				plane = clippingPlanes[ i ];\n				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;\n				distanceGradient = fwidth( distanceToPlane ) / 2.0;\n				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );\n			}\n			#pragma unroll_loop_end\n			clipOpacity *= 1.0 - unionClipOpacity;\n		#endif\n		diffuseColor.a *= clipOpacity;\n		if ( diffuseColor.a == 0.0 ) discard;\n	#else\n		#pragma unroll_loop_start\n		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {\n			plane = clippingPlanes[ i ];\n			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;\n		}\n		#pragma unroll_loop_end\n		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES\n			bool clipped = true;\n			#pragma unroll_loop_start\n			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {\n				plane = clippingPlanes[ i ];\n				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;\n			}\n			#pragma unroll_loop_end\n			if ( clipped ) discard;\n		#endif\n	#endif\n#endif";
var clipping_planes_pars_fragment = "#if NUM_CLIPPING_PLANES > 0\n	varying vec3 vClipPosition;\n	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];\n#endif";
var clipping_planes_pars_vertex = "#if NUM_CLIPPING_PLANES > 0\n	varying vec3 vClipPosition;\n#endif";
var clipping_planes_vertex = "#if NUM_CLIPPING_PLANES > 0\n	vClipPosition = - mvPosition.xyz;\n#endif";
var color_fragment = "#if defined( USE_COLOR_ALPHA )\n	diffuseColor *= vColor;\n#elif defined( USE_COLOR )\n	diffuseColor.rgb *= vColor;\n#endif";
var color_pars_fragment = "#if defined( USE_COLOR_ALPHA )\n	varying vec4 vColor;\n#elif defined( USE_COLOR )\n	varying vec3 vColor;\n#endif";
var color_pars_vertex = "#if defined( USE_COLOR_ALPHA )\n	varying vec4 vColor;\n#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n	varying vec3 vColor;\n#endif";
var color_vertex = "#if defined( USE_COLOR_ALPHA )\n	vColor = vec4( 1.0 );\n#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n	vColor = vec3( 1.0 );\n#endif\n#ifdef USE_COLOR\n	vColor *= color;\n#endif\n#ifdef USE_INSTANCING_COLOR\n	vColor.xyz *= instanceColor.xyz;\n#endif\n#ifdef USE_BATCHING_COLOR\n	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );\n	vColor.xyz *= batchingColor.xyz;\n#endif";
var common = "#define PI 3.141592653589793\n#define PI2 6.283185307179586\n#define PI_HALF 1.5707963267948966\n#define RECIPROCAL_PI 0.3183098861837907\n#define RECIPROCAL_PI2 0.15915494309189535\n#define EPSILON 1e-6\n#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif\n#define whiteComplement( a ) ( 1.0 - saturate( a ) )\nfloat pow2( const in float x ) { return x*x; }\nvec3 pow2( const in vec3 x ) { return x*x; }\nfloat pow3( const in float x ) { return x*x*x; }\nfloat pow4( const in float x ) { float x2 = x*x; return x2*x2; }\nfloat max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }\nfloat average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }\nhighp float rand( const in vec2 uv ) {\n	const highp float a = 12.9898, b = 78.233, c = 43758.5453;\n	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );\n	return fract( sin( sn ) * c );\n}\n#ifdef HIGH_PRECISION\n	float precisionSafeLength( vec3 v ) { return length( v ); }\n#else\n	float precisionSafeLength( vec3 v ) {\n		float maxComponent = max3( abs( v ) );\n		return length( v / maxComponent ) * maxComponent;\n	}\n#endif\nstruct IncidentLight {\n	vec3 color;\n	vec3 direction;\n	bool visible;\n};\nstruct ReflectedLight {\n	vec3 directDiffuse;\n	vec3 directSpecular;\n	vec3 indirectDiffuse;\n	vec3 indirectSpecular;\n};\n#ifdef USE_ALPHAHASH\n	varying vec3 vPosition;\n#endif\nvec3 transformDirection( in vec3 dir, in mat4 matrix ) {\n	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );\n}\nvec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {\n	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );\n}\nmat3 transposeMat3( const in mat3 m ) {\n	mat3 tmp;\n	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );\n	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );\n	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );\n	return tmp;\n}\nbool isPerspectiveMatrix( mat4 m ) {\n	return m[ 2 ][ 3 ] == - 1.0;\n}\nvec2 equirectUv( in vec3 dir ) {\n	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;\n	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;\n	return vec2( u, v );\n}\nvec3 BRDF_Lambert( const in vec3 diffuseColor ) {\n	return RECIPROCAL_PI * diffuseColor;\n}\nvec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {\n	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n}\nfloat F_Schlick( const in float f0, const in float f90, const in float dotVH ) {\n	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n} // validated";
var cube_uv_reflection_fragment = "#ifdef ENVMAP_TYPE_CUBE_UV\n	#define cubeUV_minMipLevel 4.0\n	#define cubeUV_minTileSize 16.0\n	float getFace( vec3 direction ) {\n		vec3 absDirection = abs( direction );\n		float face = - 1.0;\n		if ( absDirection.x > absDirection.z ) {\n			if ( absDirection.x > absDirection.y )\n				face = direction.x > 0.0 ? 0.0 : 3.0;\n			else\n				face = direction.y > 0.0 ? 1.0 : 4.0;\n		} else {\n			if ( absDirection.z > absDirection.y )\n				face = direction.z > 0.0 ? 2.0 : 5.0;\n			else\n				face = direction.y > 0.0 ? 1.0 : 4.0;\n		}\n		return face;\n	}\n	vec2 getUV( vec3 direction, float face ) {\n		vec2 uv;\n		if ( face == 0.0 ) {\n			uv = vec2( direction.z, direction.y ) / abs( direction.x );\n		} else if ( face == 1.0 ) {\n			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );\n		} else if ( face == 2.0 ) {\n			uv = vec2( - direction.x, direction.y ) / abs( direction.z );\n		} else if ( face == 3.0 ) {\n			uv = vec2( - direction.z, direction.y ) / abs( direction.x );\n		} else if ( face == 4.0 ) {\n			uv = vec2( - direction.x, direction.z ) / abs( direction.y );\n		} else {\n			uv = vec2( direction.x, direction.y ) / abs( direction.z );\n		}\n		return 0.5 * ( uv + 1.0 );\n	}\n	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {\n		float face = getFace( direction );\n		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );\n		mipInt = max( mipInt, cubeUV_minMipLevel );\n		float faceSize = exp2( mipInt );\n		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;\n		if ( face > 2.0 ) {\n			uv.y += faceSize;\n			face -= 3.0;\n		}\n		uv.x += face * faceSize;\n		uv.x += filterInt * 3.0 * cubeUV_minTileSize;\n		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );\n		uv.x *= CUBEUV_TEXEL_WIDTH;\n		uv.y *= CUBEUV_TEXEL_HEIGHT;\n		#ifdef texture2DGradEXT\n			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;\n		#else\n			return texture2D( envMap, uv ).rgb;\n		#endif\n	}\n	#define cubeUV_r0 1.0\n	#define cubeUV_m0 - 2.0\n	#define cubeUV_r1 0.8\n	#define cubeUV_m1 - 1.0\n	#define cubeUV_r4 0.4\n	#define cubeUV_m4 2.0\n	#define cubeUV_r5 0.305\n	#define cubeUV_m5 3.0\n	#define cubeUV_r6 0.21\n	#define cubeUV_m6 4.0\n	float roughnessToMip( float roughness ) {\n		float mip = 0.0;\n		if ( roughness >= cubeUV_r1 ) {\n			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;\n		} else if ( roughness >= cubeUV_r4 ) {\n			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;\n		} else if ( roughness >= cubeUV_r5 ) {\n			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;\n		} else if ( roughness >= cubeUV_r6 ) {\n			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;\n		} else {\n			mip = - 2.0 * log2( 1.16 * roughness );		}\n		return mip;\n	}\n	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {\n		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );\n		float mipF = fract( mip );\n		float mipInt = floor( mip );\n		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );\n		if ( mipF == 0.0 ) {\n			return vec4( color0, 1.0 );\n		} else {\n			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );\n			return vec4( mix( color0, color1, mipF ), 1.0 );\n		}\n	}\n#endif";
var defaultnormal_vertex = "vec3 transformedNormal = objectNormal;\n#ifdef USE_TANGENT\n	vec3 transformedTangent = objectTangent;\n#endif\n#ifdef USE_BATCHING\n	mat3 bm = mat3( batchingMatrix );\n	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );\n	transformedNormal = bm * transformedNormal;\n	#ifdef USE_TANGENT\n		transformedTangent = bm * transformedTangent;\n	#endif\n#endif\n#ifdef USE_INSTANCING\n	mat3 im = mat3( instanceMatrix );\n	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );\n	transformedNormal = im * transformedNormal;\n	#ifdef USE_TANGENT\n		transformedTangent = im * transformedTangent;\n	#endif\n#endif\ntransformedNormal = normalMatrix * transformedNormal;\n#ifdef FLIP_SIDED\n	transformedNormal = - transformedNormal;\n#endif\n#ifdef USE_TANGENT\n	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;\n	#ifdef FLIP_SIDED\n		transformedTangent = - transformedTangent;\n	#endif\n#endif";
var displacementmap_pars_vertex = "#ifdef USE_DISPLACEMENTMAP\n	uniform sampler2D displacementMap;\n	uniform float displacementScale;\n	uniform float displacementBias;\n#endif";
var displacementmap_vertex = "#ifdef USE_DISPLACEMENTMAP\n	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );\n#endif";
var emissivemap_fragment = "#ifdef USE_EMISSIVEMAP\n	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );\n	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE\n		emissiveColor = sRGBTransferEOTF( emissiveColor );\n	#endif\n	totalEmissiveRadiance *= emissiveColor.rgb;\n#endif";
var emissivemap_pars_fragment = "#ifdef USE_EMISSIVEMAP\n	uniform sampler2D emissiveMap;\n#endif";
var colorspace_fragment = "gl_FragColor = linearToOutputTexel( gl_FragColor );";
var colorspace_pars_fragment = "vec4 LinearTransferOETF( in vec4 value ) {\n	return value;\n}\nvec4 sRGBTransferEOTF( in vec4 value ) {\n	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );\n}\nvec4 sRGBTransferOETF( in vec4 value ) {\n	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );\n}";
var envmap_fragment = "#ifdef USE_ENVMAP\n	#ifdef ENV_WORLDPOS\n		vec3 cameraToFrag;\n		if ( isOrthographic ) {\n			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );\n		} else {\n			cameraToFrag = normalize( vWorldPosition - cameraPosition );\n		}\n		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n		#ifdef ENVMAP_MODE_REFLECTION\n			vec3 reflectVec = reflect( cameraToFrag, worldNormal );\n		#else\n			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );\n		#endif\n	#else\n		vec3 reflectVec = vReflect;\n	#endif\n	#ifdef ENVMAP_TYPE_CUBE\n		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );\n	#else\n		vec4 envColor = vec4( 0.0 );\n	#endif\n	#ifdef ENVMAP_BLENDING_MULTIPLY\n		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );\n	#elif defined( ENVMAP_BLENDING_MIX )\n		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );\n	#elif defined( ENVMAP_BLENDING_ADD )\n		outgoingLight += envColor.xyz * specularStrength * reflectivity;\n	#endif\n#endif";
var envmap_common_pars_fragment = "#ifdef USE_ENVMAP\n	uniform float envMapIntensity;\n	uniform float flipEnvMap;\n	uniform mat3 envMapRotation;\n	#ifdef ENVMAP_TYPE_CUBE\n		uniform samplerCube envMap;\n	#else\n		uniform sampler2D envMap;\n	#endif\n	\n#endif";
var envmap_pars_fragment = "#ifdef USE_ENVMAP\n	uniform float reflectivity;\n	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )\n		#define ENV_WORLDPOS\n	#endif\n	#ifdef ENV_WORLDPOS\n		varying vec3 vWorldPosition;\n		uniform float refractionRatio;\n	#else\n		varying vec3 vReflect;\n	#endif\n#endif";
var envmap_pars_vertex = "#ifdef USE_ENVMAP\n	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )\n		#define ENV_WORLDPOS\n	#endif\n	#ifdef ENV_WORLDPOS\n		\n		varying vec3 vWorldPosition;\n	#else\n		varying vec3 vReflect;\n		uniform float refractionRatio;\n	#endif\n#endif";
var envmap_vertex = "#ifdef USE_ENVMAP\n	#ifdef ENV_WORLDPOS\n		vWorldPosition = worldPosition.xyz;\n	#else\n		vec3 cameraToVertex;\n		if ( isOrthographic ) {\n			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );\n		} else {\n			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );\n		}\n		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n		#ifdef ENVMAP_MODE_REFLECTION\n			vReflect = reflect( cameraToVertex, worldNormal );\n		#else\n			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );\n		#endif\n	#endif\n#endif";
var fog_vertex = "#ifdef USE_FOG\n	vFogDepth = - mvPosition.z;\n#endif";
var fog_pars_vertex = "#ifdef USE_FOG\n	varying float vFogDepth;\n#endif";
var fog_fragment = "#ifdef USE_FOG\n	#ifdef FOG_EXP2\n		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n	#else\n		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n	#endif\n	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif";
var fog_pars_fragment = "#ifdef USE_FOG\n	uniform vec3 fogColor;\n	varying float vFogDepth;\n	#ifdef FOG_EXP2\n		uniform float fogDensity;\n	#else\n		uniform float fogNear;\n		uniform float fogFar;\n	#endif\n#endif";
var gradientmap_pars_fragment = "#ifdef USE_GRADIENTMAP\n	uniform sampler2D gradientMap;\n#endif\nvec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {\n	float dotNL = dot( normal, lightDirection );\n	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );\n	#ifdef USE_GRADIENTMAP\n		return vec3( texture2D( gradientMap, coord ).r );\n	#else\n		vec2 fw = fwidth( coord ) * 0.5;\n		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );\n	#endif\n}";
var lightmap_pars_fragment = "#ifdef USE_LIGHTMAP\n	uniform sampler2D lightMap;\n	uniform float lightMapIntensity;\n#endif";
var lights_lambert_fragment = "LambertMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularStrength = specularStrength;";
var lights_lambert_pars_fragment = "varying vec3 vViewPosition;\nstruct LambertMaterial {\n	vec3 diffuseColor;\n	float specularStrength;\n};\nvoid RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_Lambert\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert";
var lights_pars_begin = "uniform bool receiveShadow;\nuniform vec3 ambientLightColor;\n#if defined( USE_LIGHT_PROBES )\n	uniform vec3 lightProbe[ 9 ];\n#endif\nvec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {\n	float x = normal.x, y = normal.y, z = normal.z;\n	vec3 result = shCoefficients[ 0 ] * 0.886227;\n	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;\n	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;\n	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;\n	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;\n	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;\n	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );\n	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;\n	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );\n	return result;\n}\nvec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {\n	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );\n	return irradiance;\n}\nvec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {\n	vec3 irradiance = ambientLightColor;\n	return irradiance;\n}\nfloat getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {\n	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );\n	if ( cutoffDistance > 0.0 ) {\n		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );\n	}\n	return distanceFalloff;\n}\nfloat getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {\n	return smoothstep( coneCosine, penumbraCosine, angleCosine );\n}\n#if NUM_DIR_LIGHTS > 0\n	struct DirectionalLight {\n		vec3 direction;\n		vec3 color;\n	};\n	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];\n	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {\n		light.color = directionalLight.color;\n		light.direction = directionalLight.direction;\n		light.visible = true;\n	}\n#endif\n#if NUM_POINT_LIGHTS > 0\n	struct PointLight {\n		vec3 position;\n		vec3 color;\n		float distance;\n		float decay;\n	};\n	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];\n	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {\n		vec3 lVector = pointLight.position - geometryPosition;\n		light.direction = normalize( lVector );\n		float lightDistance = length( lVector );\n		light.color = pointLight.color;\n		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );\n		light.visible = ( light.color != vec3( 0.0 ) );\n	}\n#endif\n#if NUM_SPOT_LIGHTS > 0\n	struct SpotLight {\n		vec3 position;\n		vec3 direction;\n		vec3 color;\n		float distance;\n		float decay;\n		float coneCos;\n		float penumbraCos;\n	};\n	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];\n	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {\n		vec3 lVector = spotLight.position - geometryPosition;\n		light.direction = normalize( lVector );\n		float angleCos = dot( light.direction, spotLight.direction );\n		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );\n		if ( spotAttenuation > 0.0 ) {\n			float lightDistance = length( lVector );\n			light.color = spotLight.color * spotAttenuation;\n			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );\n			light.visible = ( light.color != vec3( 0.0 ) );\n		} else {\n			light.color = vec3( 0.0 );\n			light.visible = false;\n		}\n	}\n#endif\n#if NUM_RECT_AREA_LIGHTS > 0\n	struct RectAreaLight {\n		vec3 color;\n		vec3 position;\n		vec3 halfWidth;\n		vec3 halfHeight;\n	};\n	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;\n	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];\n#endif\n#if NUM_HEMI_LIGHTS > 0\n	struct HemisphereLight {\n		vec3 direction;\n		vec3 skyColor;\n		vec3 groundColor;\n	};\n	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];\n	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {\n		float dotNL = dot( normal, hemiLight.direction );\n		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;\n		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );\n		return irradiance;\n	}\n#endif";
var envmap_physical_pars_fragment = "#ifdef USE_ENVMAP\n	vec3 getIBLIrradiance( const in vec3 normal ) {\n		#ifdef ENVMAP_TYPE_CUBE_UV\n			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );\n			return PI * envMapColor.rgb * envMapIntensity;\n		#else\n			return vec3( 0.0 );\n		#endif\n	}\n	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {\n		#ifdef ENVMAP_TYPE_CUBE_UV\n			vec3 reflectVec = reflect( - viewDir, normal );\n			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );\n			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );\n			return envMapColor.rgb * envMapIntensity;\n		#else\n			return vec3( 0.0 );\n		#endif\n	}\n	#ifdef USE_ANISOTROPY\n		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {\n			#ifdef ENVMAP_TYPE_CUBE_UV\n				vec3 bentNormal = cross( bitangent, viewDir );\n				bentNormal = normalize( cross( bentNormal, bitangent ) );\n				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );\n				return getIBLRadiance( viewDir, bentNormal, roughness );\n			#else\n				return vec3( 0.0 );\n			#endif\n		}\n	#endif\n#endif";
var lights_toon_fragment = "ToonMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;";
var lights_toon_pars_fragment = "varying vec3 vViewPosition;\nstruct ToonMaterial {\n	vec3 diffuseColor;\n};\nvoid RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {\n	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_Toon\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon";
var lights_phong_fragment = "BlinnPhongMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularColor = specular;\nmaterial.specularShininess = shininess;\nmaterial.specularStrength = specularStrength;";
var lights_phong_pars_fragment = "varying vec3 vViewPosition;\nstruct BlinnPhongMaterial {\n	vec3 diffuseColor;\n	vec3 specularColor;\n	float specularShininess;\n	float specularStrength;\n};\nvoid RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;\n}\nvoid RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_BlinnPhong\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong";
var lights_physical_fragment = "PhysicalMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );\nvec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );\nfloat geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );\nmaterial.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;\nmaterial.roughness = min( material.roughness, 1.0 );\n#ifdef IOR\n	material.ior = ior;\n	#ifdef USE_SPECULAR\n		float specularIntensityFactor = specularIntensity;\n		vec3 specularColorFactor = specularColor;\n		#ifdef USE_SPECULAR_COLORMAP\n			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;\n		#endif\n		#ifdef USE_SPECULAR_INTENSITYMAP\n			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;\n		#endif\n		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );\n	#else\n		float specularIntensityFactor = 1.0;\n		vec3 specularColorFactor = vec3( 1.0 );\n		material.specularF90 = 1.0;\n	#endif\n	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );\n#else\n	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );\n	material.specularF90 = 1.0;\n#endif\n#ifdef USE_CLEARCOAT\n	material.clearcoat = clearcoat;\n	material.clearcoatRoughness = clearcoatRoughness;\n	material.clearcoatF0 = vec3( 0.04 );\n	material.clearcoatF90 = 1.0;\n	#ifdef USE_CLEARCOATMAP\n		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;\n	#endif\n	#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;\n	#endif\n	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );\n	material.clearcoatRoughness += geometryRoughness;\n	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );\n#endif\n#ifdef USE_DISPERSION\n	material.dispersion = dispersion;\n#endif\n#ifdef USE_IRIDESCENCE\n	material.iridescence = iridescence;\n	material.iridescenceIOR = iridescenceIOR;\n	#ifdef USE_IRIDESCENCEMAP\n		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;\n	#endif\n	#ifdef USE_IRIDESCENCE_THICKNESSMAP\n		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;\n	#else\n		material.iridescenceThickness = iridescenceThicknessMaximum;\n	#endif\n#endif\n#ifdef USE_SHEEN\n	material.sheenColor = sheenColor;\n	#ifdef USE_SHEEN_COLORMAP\n		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;\n	#endif\n	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );\n	#ifdef USE_SHEEN_ROUGHNESSMAP\n		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;\n	#endif\n#endif\n#ifdef USE_ANISOTROPY\n	#ifdef USE_ANISOTROPYMAP\n		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );\n		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;\n		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;\n	#else\n		vec2 anisotropyV = anisotropyVector;\n	#endif\n	material.anisotropy = length( anisotropyV );\n	if( material.anisotropy == 0.0 ) {\n		anisotropyV = vec2( 1.0, 0.0 );\n	} else {\n		anisotropyV /= material.anisotropy;\n		material.anisotropy = saturate( material.anisotropy );\n	}\n	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );\n	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;\n	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;\n#endif";
var lights_physical_pars_fragment = "struct PhysicalMaterial {\n	vec3 diffuseColor;\n	float roughness;\n	vec3 specularColor;\n	float specularF90;\n	float dispersion;\n	#ifdef USE_CLEARCOAT\n		float clearcoat;\n		float clearcoatRoughness;\n		vec3 clearcoatF0;\n		float clearcoatF90;\n	#endif\n	#ifdef USE_IRIDESCENCE\n		float iridescence;\n		float iridescenceIOR;\n		float iridescenceThickness;\n		vec3 iridescenceFresnel;\n		vec3 iridescenceF0;\n	#endif\n	#ifdef USE_SHEEN\n		vec3 sheenColor;\n		float sheenRoughness;\n	#endif\n	#ifdef IOR\n		float ior;\n	#endif\n	#ifdef USE_TRANSMISSION\n		float transmission;\n		float transmissionAlpha;\n		float thickness;\n		float attenuationDistance;\n		vec3 attenuationColor;\n	#endif\n	#ifdef USE_ANISOTROPY\n		float anisotropy;\n		float alphaT;\n		vec3 anisotropyT;\n		vec3 anisotropyB;\n	#endif\n};\nvec3 clearcoatSpecularDirect = vec3( 0.0 );\nvec3 clearcoatSpecularIndirect = vec3( 0.0 );\nvec3 sheenSpecularDirect = vec3( 0.0 );\nvec3 sheenSpecularIndirect = vec3(0.0 );\nvec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {\n    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );\n    float x2 = x * x;\n    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );\n    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );\n}\nfloat V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {\n	float a2 = pow2( alpha );\n	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );\n	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );\n	return 0.5 / max( gv + gl, EPSILON );\n}\nfloat D_GGX( const in float alpha, const in float dotNH ) {\n	float a2 = pow2( alpha );\n	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;\n	return RECIPROCAL_PI * a2 / pow2( denom );\n}\n#ifdef USE_ANISOTROPY\n	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {\n		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );\n		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );\n		float v = 0.5 / ( gv + gl );\n		return saturate(v);\n	}\n	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {\n		float a2 = alphaT * alphaB;\n		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );\n		highp float v2 = dot( v, v );\n		float w2 = a2 / v2;\n		return RECIPROCAL_PI * a2 * pow2 ( w2 );\n	}\n#endif\n#ifdef USE_CLEARCOAT\n	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {\n		vec3 f0 = material.clearcoatF0;\n		float f90 = material.clearcoatF90;\n		float roughness = material.clearcoatRoughness;\n		float alpha = pow2( roughness );\n		vec3 halfDir = normalize( lightDir + viewDir );\n		float dotNL = saturate( dot( normal, lightDir ) );\n		float dotNV = saturate( dot( normal, viewDir ) );\n		float dotNH = saturate( dot( normal, halfDir ) );\n		float dotVH = saturate( dot( viewDir, halfDir ) );\n		vec3 F = F_Schlick( f0, f90, dotVH );\n		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );\n		float D = D_GGX( alpha, dotNH );\n		return F * ( V * D );\n	}\n#endif\nvec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {\n	vec3 f0 = material.specularColor;\n	float f90 = material.specularF90;\n	float roughness = material.roughness;\n	float alpha = pow2( roughness );\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float dotVH = saturate( dot( viewDir, halfDir ) );\n	vec3 F = F_Schlick( f0, f90, dotVH );\n	#ifdef USE_IRIDESCENCE\n		F = mix( F, material.iridescenceFresnel, material.iridescence );\n	#endif\n	#ifdef USE_ANISOTROPY\n		float dotTL = dot( material.anisotropyT, lightDir );\n		float dotTV = dot( material.anisotropyT, viewDir );\n		float dotTH = dot( material.anisotropyT, halfDir );\n		float dotBL = dot( material.anisotropyB, lightDir );\n		float dotBV = dot( material.anisotropyB, viewDir );\n		float dotBH = dot( material.anisotropyB, halfDir );\n		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );\n		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );\n	#else\n		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );\n		float D = D_GGX( alpha, dotNH );\n	#endif\n	return F * ( V * D );\n}\nvec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {\n	const float LUT_SIZE = 64.0;\n	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;\n	const float LUT_BIAS = 0.5 / LUT_SIZE;\n	float dotNV = saturate( dot( N, V ) );\n	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );\n	uv = uv * LUT_SCALE + LUT_BIAS;\n	return uv;\n}\nfloat LTC_ClippedSphereFormFactor( const in vec3 f ) {\n	float l = length( f );\n	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );\n}\nvec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {\n	float x = dot( v1, v2 );\n	float y = abs( x );\n	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;\n	float b = 3.4175940 + ( 4.1616724 + y ) * y;\n	float v = a / b;\n	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;\n	return cross( v1, v2 ) * theta_sintheta;\n}\nvec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {\n	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];\n	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];\n	vec3 lightNormal = cross( v1, v2 );\n	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );\n	vec3 T1, T2;\n	T1 = normalize( V - N * dot( V, N ) );\n	T2 = - cross( N, T1 );\n	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );\n	vec3 coords[ 4 ];\n	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );\n	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );\n	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );\n	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );\n	coords[ 0 ] = normalize( coords[ 0 ] );\n	coords[ 1 ] = normalize( coords[ 1 ] );\n	coords[ 2 ] = normalize( coords[ 2 ] );\n	coords[ 3 ] = normalize( coords[ 3 ] );\n	vec3 vectorFormFactor = vec3( 0.0 );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );\n	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );\n	return vec3( result );\n}\n#if defined( USE_SHEEN )\nfloat D_Charlie( float roughness, float dotNH ) {\n	float alpha = pow2( roughness );\n	float invAlpha = 1.0 / alpha;\n	float cos2h = dotNH * dotNH;\n	float sin2h = max( 1.0 - cos2h, 0.0078125 );\n	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );\n}\nfloat V_Neubelt( float dotNV, float dotNL ) {\n	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );\n}\nvec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float D = D_Charlie( sheenRoughness, dotNH );\n	float V = V_Neubelt( dotNV, dotNL );\n	return sheenColor * ( D * V );\n}\n#endif\nfloat IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float r2 = roughness * roughness;\n	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;\n	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;\n	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );\n	return saturate( DG * RECIPROCAL_PI );\n}\nvec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {\n	float dotNV = saturate( dot( normal, viewDir ) );\n	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );\n	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );\n	vec4 r = roughness * c0 + c1;\n	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;\n	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;\n	return fab;\n}\nvec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {\n	vec2 fab = DFGApprox( normal, viewDir, roughness );\n	return specularColor * fab.x + specularF90 * fab.y;\n}\n#ifdef USE_IRIDESCENCE\nvoid computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {\n#else\nvoid computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {\n#endif\n	vec2 fab = DFGApprox( normal, viewDir, roughness );\n	#ifdef USE_IRIDESCENCE\n		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );\n	#else\n		vec3 Fr = specularColor;\n	#endif\n	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;\n	float Ess = fab.x + fab.y;\n	float Ems = 1.0 - Ess;\n	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );\n	singleScatter += FssEss;\n	multiScatter += Fms * Ems;\n}\n#if NUM_RECT_AREA_LIGHTS > 0\n	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n		vec3 normal = geometryNormal;\n		vec3 viewDir = geometryViewDir;\n		vec3 position = geometryPosition;\n		vec3 lightPos = rectAreaLight.position;\n		vec3 halfWidth = rectAreaLight.halfWidth;\n		vec3 halfHeight = rectAreaLight.halfHeight;\n		vec3 lightColor = rectAreaLight.color;\n		float roughness = material.roughness;\n		vec3 rectCoords[ 4 ];\n		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;\n		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;\n		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;\n		vec2 uv = LTC_Uv( normal, viewDir, roughness );\n		vec4 t1 = texture2D( ltc_1, uv );\n		vec4 t2 = texture2D( ltc_2, uv );\n		mat3 mInv = mat3(\n			vec3( t1.x, 0, t1.y ),\n			vec3(    0, 1,    0 ),\n			vec3( t1.z, 0, t1.w )\n		);\n		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );\n		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );\n		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );\n	}\n#endif\nvoid RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	#ifdef USE_CLEARCOAT\n		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );\n		vec3 ccIrradiance = dotNLcc * directLight.color;\n		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );\n	#endif\n	#ifdef USE_SHEEN\n		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );\n	#endif\n	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {\n	#ifdef USE_CLEARCOAT\n		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );\n	#endif\n	#ifdef USE_SHEEN\n		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );\n	#endif\n	vec3 singleScattering = vec3( 0.0 );\n	vec3 multiScattering = vec3( 0.0 );\n	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;\n	#ifdef USE_IRIDESCENCE\n		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );\n	#else\n		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );\n	#endif\n	vec3 totalScattering = singleScattering + multiScattering;\n	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );\n	reflectedLight.indirectSpecular += radiance * singleScattering;\n	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;\n	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;\n}\n#define RE_Direct				RE_Direct_Physical\n#define RE_Direct_RectArea		RE_Direct_RectArea_Physical\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical\n#define RE_IndirectSpecular		RE_IndirectSpecular_Physical\nfloat computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {\n	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );\n}";
var lights_fragment_begin = "\nvec3 geometryPosition = - vViewPosition;\nvec3 geometryNormal = normal;\nvec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );\nvec3 geometryClearcoatNormal = vec3( 0.0 );\n#ifdef USE_CLEARCOAT\n	geometryClearcoatNormal = clearcoatNormal;\n#endif\n#ifdef USE_IRIDESCENCE\n	float dotNVi = saturate( dot( normal, geometryViewDir ) );\n	if ( material.iridescenceThickness == 0.0 ) {\n		material.iridescence = 0.0;\n	} else {\n		material.iridescence = saturate( material.iridescence );\n	}\n	if ( material.iridescence > 0.0 ) {\n		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );\n		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );\n	}\n#endif\nIncidentLight directLight;\n#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )\n	PointLight pointLight;\n	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0\n	PointLightShadow pointLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {\n		pointLight = pointLights[ i ];\n		getPointLightInfo( pointLight, geometryPosition, directLight );\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )\n		pointLightShadow = pointLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )\n	SpotLight spotLight;\n	vec4 spotColor;\n	vec3 spotLightCoord;\n	bool inSpotLightMap;\n	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0\n	SpotLightShadow spotLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n		spotLight = spotLights[ i ];\n		getSpotLightInfo( spotLight, geometryPosition, directLight );\n		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )\n		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX\n		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS\n		#else\n		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )\n		#endif\n		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )\n			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;\n			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );\n			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );\n			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;\n		#endif\n		#undef SPOT_LIGHT_MAP_INDEX\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n		spotLightShadow = spotLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n	DirectionalLight directionalLight;\n	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n	DirectionalLightShadow directionalLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {\n		directionalLight = directionalLights[ i ];\n		getDirectionalLightInfo( directionalLight, directLight );\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )\n		directionalLightShadow = directionalLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )\n	RectAreaLight rectAreaLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {\n		rectAreaLight = rectAreaLights[ i ];\n		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if defined( RE_IndirectDiffuse )\n	vec3 iblIrradiance = vec3( 0.0 );\n	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );\n	#if defined( USE_LIGHT_PROBES )\n		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );\n	#endif\n	#if ( NUM_HEMI_LIGHTS > 0 )\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {\n			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );\n		}\n		#pragma unroll_loop_end\n	#endif\n#endif\n#if defined( RE_IndirectSpecular )\n	vec3 radiance = vec3( 0.0 );\n	vec3 clearcoatRadiance = vec3( 0.0 );\n#endif";
var lights_fragment_maps = "#if defined( RE_IndirectDiffuse )\n	#ifdef USE_LIGHTMAP\n		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );\n		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;\n		irradiance += lightMapIrradiance;\n	#endif\n	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )\n		iblIrradiance += getIBLIrradiance( geometryNormal );\n	#endif\n#endif\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )\n	#ifdef USE_ANISOTROPY\n		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );\n	#else\n		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );\n	#endif\n	#ifdef USE_CLEARCOAT\n		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );\n	#endif\n#endif";
var lights_fragment_end = "#if defined( RE_IndirectDiffuse )\n	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n#endif\n#if defined( RE_IndirectSpecular )\n	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n#endif";
var logdepthbuf_fragment = "#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;\n#endif";
var logdepthbuf_pars_fragment = "#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n	uniform float logDepthBufFC;\n	varying float vFragDepth;\n	varying float vIsPerspective;\n#endif";
var logdepthbuf_pars_vertex = "#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n	varying float vFragDepth;\n	varying float vIsPerspective;\n#endif";
var logdepthbuf_vertex = "#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n	vFragDepth = 1.0 + gl_Position.w;\n	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );\n#endif";
var map_fragment = "#ifdef USE_MAP\n	vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n	#ifdef DECODE_VIDEO_TEXTURE\n		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );\n	#endif\n	diffuseColor *= sampledDiffuseColor;\n#endif";
var map_pars_fragment = "#ifdef USE_MAP\n	uniform sampler2D map;\n#endif";
var map_particle_fragment = "#if defined( USE_MAP ) || defined( USE_ALPHAMAP )\n	#if defined( USE_POINTS_UV )\n		vec2 uv = vUv;\n	#else\n		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;\n	#endif\n#endif\n#ifdef USE_MAP\n	diffuseColor *= texture2D( map, uv );\n#endif\n#ifdef USE_ALPHAMAP\n	diffuseColor.a *= texture2D( alphaMap, uv ).g;\n#endif";
var map_particle_pars_fragment = "#if defined( USE_POINTS_UV )\n	varying vec2 vUv;\n#else\n	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )\n		uniform mat3 uvTransform;\n	#endif\n#endif\n#ifdef USE_MAP\n	uniform sampler2D map;\n#endif\n#ifdef USE_ALPHAMAP\n	uniform sampler2D alphaMap;\n#endif";
var metalnessmap_fragment = "float metalnessFactor = metalness;\n#ifdef USE_METALNESSMAP\n	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );\n	metalnessFactor *= texelMetalness.b;\n#endif";
var metalnessmap_pars_fragment = "#ifdef USE_METALNESSMAP\n	uniform sampler2D metalnessMap;\n#endif";
var morphinstance_vertex = "#ifdef USE_INSTANCING_MORPH\n	float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;\n	}\n#endif";
var morphcolor_vertex = "#if defined( USE_MORPHCOLORS )\n	vColor *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		#if defined( USE_COLOR_ALPHA )\n			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];\n		#elif defined( USE_COLOR )\n			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];\n		#endif\n	}\n#endif";
var morphnormal_vertex = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];\n	}\n#endif";
var morphtarget_pars_vertex = "#ifdef USE_MORPHTARGETS\n	#ifndef USE_INSTANCING_MORPH\n		uniform float morphTargetBaseInfluence;\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n	#endif\n	uniform sampler2DArray morphTargetsTexture;\n	uniform ivec2 morphTargetsTextureSize;\n	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {\n		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;\n		int y = texelIndex / morphTargetsTextureSize.x;\n		int x = texelIndex - y * morphTargetsTextureSize.x;\n		ivec3 morphUV = ivec3( x, y, morphTargetIndex );\n		return texelFetch( morphTargetsTexture, morphUV, 0 );\n	}\n#endif";
var morphtarget_vertex = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];\n	}\n#endif";
var normal_fragment_begin = "float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;\n#ifdef FLAT_SHADED\n	vec3 fdx = dFdx( vViewPosition );\n	vec3 fdy = dFdy( vViewPosition );\n	vec3 normal = normalize( cross( fdx, fdy ) );\n#else\n	vec3 normal = normalize( vNormal );\n	#ifdef DOUBLE_SIDED\n		normal *= faceDirection;\n	#endif\n#endif\n#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )\n	#ifdef USE_TANGENT\n		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );\n	#else\n		mat3 tbn = getTangentFrame( - vViewPosition, normal,\n		#if defined( USE_NORMALMAP )\n			vNormalMapUv\n		#elif defined( USE_CLEARCOAT_NORMALMAP )\n			vClearcoatNormalMapUv\n		#else\n			vUv\n		#endif\n		);\n	#endif\n	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n		tbn[0] *= faceDirection;\n		tbn[1] *= faceDirection;\n	#endif\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	#ifdef USE_TANGENT\n		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );\n	#else\n		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );\n	#endif\n	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n		tbn2[0] *= faceDirection;\n		tbn2[1] *= faceDirection;\n	#endif\n#endif\nvec3 nonPerturbedNormal = normal;";
var normal_fragment_maps = "#ifdef USE_NORMALMAP_OBJECTSPACE\n	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n	#ifdef FLIP_SIDED\n		normal = - normal;\n	#endif\n	#ifdef DOUBLE_SIDED\n		normal = normal * faceDirection;\n	#endif\n	normal = normalize( normalMatrix * normal );\n#elif defined( USE_NORMALMAP_TANGENTSPACE )\n	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n	mapN.xy *= normalScale;\n	normal = normalize( tbn * mapN );\n#elif defined( USE_BUMPMAP )\n	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );\n#endif";
var normal_pars_fragment = "#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n	#ifdef USE_TANGENT\n		varying vec3 vTangent;\n		varying vec3 vBitangent;\n	#endif\n#endif";
var normal_pars_vertex = "#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n	#ifdef USE_TANGENT\n		varying vec3 vTangent;\n		varying vec3 vBitangent;\n	#endif\n#endif";
var normal_vertex = "#ifndef FLAT_SHADED\n	vNormal = normalize( transformedNormal );\n	#ifdef USE_TANGENT\n		vTangent = normalize( transformedTangent );\n		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );\n	#endif\n#endif";
var normalmap_pars_fragment = "#ifdef USE_NORMALMAP\n	uniform sampler2D normalMap;\n	uniform vec2 normalScale;\n#endif\n#ifdef USE_NORMALMAP_OBJECTSPACE\n	uniform mat3 normalMatrix;\n#endif\n#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )\n	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {\n		vec3 q0 = dFdx( eye_pos.xyz );\n		vec3 q1 = dFdy( eye_pos.xyz );\n		vec2 st0 = dFdx( uv.st );\n		vec2 st1 = dFdy( uv.st );\n		vec3 N = surf_norm;\n		vec3 q1perp = cross( q1, N );\n		vec3 q0perp = cross( N, q0 );\n		vec3 T = q1perp * st0.x + q0perp * st1.x;\n		vec3 B = q1perp * st0.y + q0perp * st1.y;\n		float det = max( dot( T, T ), dot( B, B ) );\n		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );\n		return mat3( T * scale, B * scale, N );\n	}\n#endif";
var clearcoat_normal_fragment_begin = "#ifdef USE_CLEARCOAT\n	vec3 clearcoatNormal = nonPerturbedNormal;\n#endif";
var clearcoat_normal_fragment_maps = "#ifdef USE_CLEARCOAT_NORMALMAP\n	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;\n	clearcoatMapN.xy *= clearcoatNormalScale;\n	clearcoatNormal = normalize( tbn2 * clearcoatMapN );\n#endif";
var clearcoat_pars_fragment = "#ifdef USE_CLEARCOATMAP\n	uniform sampler2D clearcoatMap;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	uniform sampler2D clearcoatNormalMap;\n	uniform vec2 clearcoatNormalScale;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	uniform sampler2D clearcoatRoughnessMap;\n#endif";
var iridescence_pars_fragment = "#ifdef USE_IRIDESCENCEMAP\n	uniform sampler2D iridescenceMap;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	uniform sampler2D iridescenceThicknessMap;\n#endif";
var opaque_fragment = "#ifdef OPAQUE\ndiffuseColor.a = 1.0;\n#endif\n#ifdef USE_TRANSMISSION\ndiffuseColor.a *= material.transmissionAlpha;\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );";
var packing = "vec3 packNormalToRGB( const in vec3 normal ) {\n	return normalize( normal ) * 0.5 + 0.5;\n}\nvec3 unpackRGBToNormal( const in vec3 rgb ) {\n	return 2.0 * rgb.xyz - 1.0;\n}\nconst float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;\nconst float Inv255 = 1. / 255.;\nconst vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );\nconst vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );\nconst vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );\nconst vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );\nvec4 packDepthToRGBA( const in float v ) {\n	if( v <= 0.0 )\n		return vec4( 0., 0., 0., 0. );\n	if( v >= 1.0 )\n		return vec4( 1., 1., 1., 1. );\n	float vuf;\n	float af = modf( v * PackFactors.a, vuf );\n	float bf = modf( vuf * ShiftRight8, vuf );\n	float gf = modf( vuf * ShiftRight8, vuf );\n	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );\n}\nvec3 packDepthToRGB( const in float v ) {\n	if( v <= 0.0 )\n		return vec3( 0., 0., 0. );\n	if( v >= 1.0 )\n		return vec3( 1., 1., 1. );\n	float vuf;\n	float bf = modf( v * PackFactors.b, vuf );\n	float gf = modf( vuf * ShiftRight8, vuf );\n	return vec3( vuf * Inv255, gf * PackUpscale, bf );\n}\nvec2 packDepthToRG( const in float v ) {\n	if( v <= 0.0 )\n		return vec2( 0., 0. );\n	if( v >= 1.0 )\n		return vec2( 1., 1. );\n	float vuf;\n	float gf = modf( v * 256., vuf );\n	return vec2( vuf * Inv255, gf );\n}\nfloat unpackRGBAToDepth( const in vec4 v ) {\n	return dot( v, UnpackFactors4 );\n}\nfloat unpackRGBToDepth( const in vec3 v ) {\n	return dot( v, UnpackFactors3 );\n}\nfloat unpackRGToDepth( const in vec2 v ) {\n	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;\n}\nvec4 pack2HalfToRGBA( const in vec2 v ) {\n	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );\n	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );\n}\nvec2 unpackRGBATo2Half( const in vec4 v ) {\n	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );\n}\nfloat viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {\n	return ( viewZ + near ) / ( near - far );\n}\nfloat orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {\n	return depth * ( near - far ) - near;\n}\nfloat viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {\n	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );\n}\nfloat perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {\n	return ( near * far ) / ( ( far - near ) * depth - far );\n}";
var premultiplied_alpha_fragment = "#ifdef PREMULTIPLIED_ALPHA\n	gl_FragColor.rgb *= gl_FragColor.a;\n#endif";
var project_vertex = "vec4 mvPosition = vec4( transformed, 1.0 );\n#ifdef USE_BATCHING\n	mvPosition = batchingMatrix * mvPosition;\n#endif\n#ifdef USE_INSTANCING\n	mvPosition = instanceMatrix * mvPosition;\n#endif\nmvPosition = modelViewMatrix * mvPosition;\ngl_Position = projectionMatrix * mvPosition;";
var dithering_fragment = "#ifdef DITHERING\n	gl_FragColor.rgb = dithering( gl_FragColor.rgb );\n#endif";
var dithering_pars_fragment = "#ifdef DITHERING\n	vec3 dithering( vec3 color ) {\n		float grid_position = rand( gl_FragCoord.xy );\n		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );\n		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );\n		return color + dither_shift_RGB;\n	}\n#endif";
var roughnessmap_fragment = "float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );\n	roughnessFactor *= texelRoughness.g;\n#endif";
var roughnessmap_pars_fragment = "#ifdef USE_ROUGHNESSMAP\n	uniform sampler2D roughnessMap;\n#endif";
var shadowmap_pars_fragment = "#if NUM_SPOT_LIGHT_COORDS > 0\n	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];\n#endif\n#if NUM_SPOT_LIGHT_MAPS > 0\n	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];\n#endif\n#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];\n		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];\n		struct DirectionalLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];\n		struct SpotLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];\n		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];\n		struct PointLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n			float shadowCameraNear;\n			float shadowCameraFar;\n		};\n		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];\n	#endif\n	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {\n		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );\n		#ifdef USE_REVERSED_DEPTH_BUFFER\n			return step( depth, compare );\n		#else\n			return step( compare, depth );\n		#endif\n	}\n	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {\n		return unpackRGBATo2Half( texture2D( shadow, uv ) );\n	}\n	float VSMShadow( sampler2D shadow, vec2 uv, float compare ) {\n		float occlusion = 1.0;\n		vec2 distribution = texture2DDistribution( shadow, uv );\n		#ifdef USE_REVERSED_DEPTH_BUFFER\n			float hard_shadow = step( distribution.x, compare );\n		#else\n			float hard_shadow = step( compare, distribution.x );\n		#endif\n		if ( hard_shadow != 1.0 ) {\n			float distance = compare - distribution.x;\n			float variance = max( 0.00000, distribution.y * distribution.y );\n			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );\n		}\n		return occlusion;\n	}\n	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {\n		float shadow = 1.0;\n		shadowCoord.xyz /= shadowCoord.w;\n		shadowCoord.z += shadowBias;\n		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;\n		if ( frustumTest ) {\n		#if defined( SHADOWMAP_TYPE_PCF )\n			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;\n			float dx0 = - texelSize.x * shadowRadius;\n			float dy0 = - texelSize.y * shadowRadius;\n			float dx1 = + texelSize.x * shadowRadius;\n			float dy1 = + texelSize.y * shadowRadius;\n			float dx2 = dx0 / 2.0;\n			float dy2 = dy0 / 2.0;\n			float dx3 = dx1 / 2.0;\n			float dy3 = dy1 / 2.0;\n			shadow = (\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )\n			) * ( 1.0 / 17.0 );\n		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )\n			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;\n			float dx = texelSize.x;\n			float dy = texelSize.y;\n			vec2 uv = shadowCoord.xy;\n			vec2 f = fract( uv * shadowMapSize + 0.5 );\n			uv -= f * texelSize;\n			shadow = (\n				texture2DCompare( shadowMap, uv, shadowCoord.z ) +\n				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +\n				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),\n					 f.x ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),\n					 f.x ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),\n					 f.y ) +\n				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),\n					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),\n					 f.y ) +\n				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),\n						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),\n						  f.x ),\n					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),\n						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),\n						  f.x ),\n					 f.y )\n			) * ( 1.0 / 9.0 );\n		#elif defined( SHADOWMAP_TYPE_VSM )\n			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );\n		#else\n			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );\n		#endif\n		}\n		return mix( 1.0, shadow, shadowIntensity );\n	}\n	vec2 cubeToUV( vec3 v, float texelSizeY ) {\n		vec3 absV = abs( v );\n		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );\n		absV *= scaleToCube;\n		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );\n		vec2 planar = v.xy;\n		float almostATexel = 1.5 * texelSizeY;\n		float almostOne = 1.0 - almostATexel;\n		if ( absV.z >= almostOne ) {\n			if ( v.z > 0.0 )\n				planar.x = 4.0 - v.x;\n		} else if ( absV.x >= almostOne ) {\n			float signX = sign( v.x );\n			planar.x = v.z * signX + 2.0 * signX;\n		} else if ( absV.y >= almostOne ) {\n			float signY = sign( v.y );\n			planar.x = v.x + 2.0 * signY + 2.0;\n			planar.y = v.z * signY - 2.0;\n		}\n		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );\n	}\n	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {\n		float shadow = 1.0;\n		vec3 lightToPosition = shadowCoord.xyz;\n		\n		float lightToPositionLength = length( lightToPosition );\n		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {\n			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;\n			vec3 bd3D = normalize( lightToPosition );\n			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );\n			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )\n				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;\n				shadow = (\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +\n					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )\n				) * ( 1.0 / 9.0 );\n			#else\n				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );\n			#endif\n		}\n		return mix( 1.0, shadow, shadowIntensity );\n	}\n#endif";
var shadowmap_pars_vertex = "#if NUM_SPOT_LIGHT_COORDS > 0\n	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];\n	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];\n#endif\n#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];\n		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];\n		struct DirectionalLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n		struct SpotLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];\n		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];\n		struct PointLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n			float shadowCameraNear;\n			float shadowCameraFar;\n		};\n		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];\n	#endif\n#endif";
var shadowmap_vertex = "#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )\n	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n	vec4 shadowWorldPosition;\n#endif\n#if defined( USE_SHADOWMAP )\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {\n			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );\n			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;\n		}\n		#pragma unroll_loop_end\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {\n			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );\n			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;\n		}\n		#pragma unroll_loop_end\n	#endif\n#endif\n#if NUM_SPOT_LIGHT_COORDS > 0\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {\n		shadowWorldPosition = worldPosition;\n		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;\n		#endif\n		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;\n	}\n	#pragma unroll_loop_end\n#endif";
var shadowmask_pars_fragment = "float getShadowMask() {\n	float shadow = 1.0;\n	#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n	DirectionalLightShadow directionalLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {\n		directionalLight = directionalLightShadows[ i ];\n		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n	SpotLightShadow spotLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {\n		spotLight = spotLightShadows[ i ];\n		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n	PointLightShadow pointLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {\n		pointLight = pointLightShadows[ i ];\n		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#endif\n	return shadow;\n}";
var skinbase_vertex = "#ifdef USE_SKINNING\n	mat4 boneMatX = getBoneMatrix( skinIndex.x );\n	mat4 boneMatY = getBoneMatrix( skinIndex.y );\n	mat4 boneMatZ = getBoneMatrix( skinIndex.z );\n	mat4 boneMatW = getBoneMatrix( skinIndex.w );\n#endif";
var skinning_pars_vertex = "#ifdef USE_SKINNING\n	uniform mat4 bindMatrix;\n	uniform mat4 bindMatrixInverse;\n	uniform highp sampler2D boneTexture;\n	mat4 getBoneMatrix( const in float i ) {\n		int size = textureSize( boneTexture, 0 ).x;\n		int j = int( i ) * 4;\n		int x = j % size;\n		int y = j / size;\n		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );\n		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );\n		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );\n		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );\n		return mat4( v1, v2, v3, v4 );\n	}\n#endif";
var skinning_vertex = "#ifdef USE_SKINNING\n	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );\n	vec4 skinned = vec4( 0.0 );\n	skinned += boneMatX * skinVertex * skinWeight.x;\n	skinned += boneMatY * skinVertex * skinWeight.y;\n	skinned += boneMatZ * skinVertex * skinWeight.z;\n	skinned += boneMatW * skinVertex * skinWeight.w;\n	transformed = ( bindMatrixInverse * skinned ).xyz;\n#endif";
var skinnormal_vertex = "#ifdef USE_SKINNING\n	mat4 skinMatrix = mat4( 0.0 );\n	skinMatrix += skinWeight.x * boneMatX;\n	skinMatrix += skinWeight.y * boneMatY;\n	skinMatrix += skinWeight.z * boneMatZ;\n	skinMatrix += skinWeight.w * boneMatW;\n	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;\n	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;\n	#ifdef USE_TANGENT\n		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;\n	#endif\n#endif";
var specularmap_fragment = "float specularStrength;\n#ifdef USE_SPECULARMAP\n	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );\n	specularStrength = texelSpecular.r;\n#else\n	specularStrength = 1.0;\n#endif";
var specularmap_pars_fragment = "#ifdef USE_SPECULARMAP\n	uniform sampler2D specularMap;\n#endif";
var tonemapping_fragment = "#if defined( TONE_MAPPING )\n	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );\n#endif";
var tonemapping_pars_fragment = "#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif\nuniform float toneMappingExposure;\nvec3 LinearToneMapping( vec3 color ) {\n	return saturate( toneMappingExposure * color );\n}\nvec3 ReinhardToneMapping( vec3 color ) {\n	color *= toneMappingExposure;\n	return saturate( color / ( vec3( 1.0 ) + color ) );\n}\nvec3 CineonToneMapping( vec3 color ) {\n	color *= toneMappingExposure;\n	color = max( vec3( 0.0 ), color - 0.004 );\n	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );\n}\nvec3 RRTAndODTFit( vec3 v ) {\n	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;\n	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;\n	return a / b;\n}\nvec3 ACESFilmicToneMapping( vec3 color ) {\n	const mat3 ACESInputMat = mat3(\n		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),\n		vec3( 0.04823, 0.01566, 0.83777 )\n	);\n	const mat3 ACESOutputMat = mat3(\n		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),\n		vec3( -0.07367, -0.00605,  1.07602 )\n	);\n	color *= toneMappingExposure / 0.6;\n	color = ACESInputMat * color;\n	color = RRTAndODTFit( color );\n	color = ACESOutputMat * color;\n	return saturate( color );\n}\nconst mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(\n	vec3( 1.6605, - 0.1246, - 0.0182 ),\n	vec3( - 0.5876, 1.1329, - 0.1006 ),\n	vec3( - 0.0728, - 0.0083, 1.1187 )\n);\nconst mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(\n	vec3( 0.6274, 0.0691, 0.0164 ),\n	vec3( 0.3293, 0.9195, 0.0880 ),\n	vec3( 0.0433, 0.0113, 0.8956 )\n);\nvec3 agxDefaultContrastApprox( vec3 x ) {\n	vec3 x2 = x * x;\n	vec3 x4 = x2 * x2;\n	return + 15.5 * x4 * x2\n		- 40.14 * x4 * x\n		+ 31.96 * x4\n		- 6.868 * x2 * x\n		+ 0.4298 * x2\n		+ 0.1191 * x\n		- 0.00232;\n}\nvec3 AgXToneMapping( vec3 color ) {\n	const mat3 AgXInsetMatrix = mat3(\n		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),\n		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),\n		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )\n	);\n	const mat3 AgXOutsetMatrix = mat3(\n		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),\n		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),\n		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )\n	);\n	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;\n	color *= toneMappingExposure;\n	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;\n	color = AgXInsetMatrix * color;\n	color = max( color, 1e-10 );	color = log2( color );\n	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );\n	color = clamp( color, 0.0, 1.0 );\n	color = agxDefaultContrastApprox( color );\n	color = AgXOutsetMatrix * color;\n	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );\n	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;\n	color = clamp( color, 0.0, 1.0 );\n	return color;\n}\nvec3 NeutralToneMapping( vec3 color ) {\n	const float StartCompression = 0.8 - 0.04;\n	const float Desaturation = 0.15;\n	color *= toneMappingExposure;\n	float x = min( color.r, min( color.g, color.b ) );\n	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;\n	color -= offset;\n	float peak = max( color.r, max( color.g, color.b ) );\n	if ( peak < StartCompression ) return color;\n	float d = 1. - StartCompression;\n	float newPeak = 1. - d * d / ( peak + d - StartCompression );\n	color *= newPeak / peak;\n	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );\n	return mix( color, vec3( newPeak ), g );\n}\nvec3 CustomToneMapping( vec3 color ) { return color; }";
var transmission_fragment = "#ifdef USE_TRANSMISSION\n	material.transmission = transmission;\n	material.transmissionAlpha = 1.0;\n	material.thickness = thickness;\n	material.attenuationDistance = attenuationDistance;\n	material.attenuationColor = attenuationColor;\n	#ifdef USE_TRANSMISSIONMAP\n		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;\n	#endif\n	#ifdef USE_THICKNESSMAP\n		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;\n	#endif\n	vec3 pos = vWorldPosition;\n	vec3 v = normalize( cameraPosition - pos );\n	vec3 n = inverseTransformDirection( normal, viewMatrix );\n	vec4 transmitted = getIBLVolumeRefraction(\n		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,\n		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,\n		material.attenuationColor, material.attenuationDistance );\n	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );\n	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );\n#endif";
var transmission_pars_fragment = "#ifdef USE_TRANSMISSION\n	uniform float transmission;\n	uniform float thickness;\n	uniform float attenuationDistance;\n	uniform vec3 attenuationColor;\n	#ifdef USE_TRANSMISSIONMAP\n		uniform sampler2D transmissionMap;\n	#endif\n	#ifdef USE_THICKNESSMAP\n		uniform sampler2D thicknessMap;\n	#endif\n	uniform vec2 transmissionSamplerSize;\n	uniform sampler2D transmissionSamplerMap;\n	uniform mat4 modelMatrix;\n	uniform mat4 projectionMatrix;\n	varying vec3 vWorldPosition;\n	float w0( float a ) {\n		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );\n	}\n	float w1( float a ) {\n		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );\n	}\n	float w2( float a ){\n		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );\n	}\n	float w3( float a ) {\n		return ( 1.0 / 6.0 ) * ( a * a * a );\n	}\n	float g0( float a ) {\n		return w0( a ) + w1( a );\n	}\n	float g1( float a ) {\n		return w2( a ) + w3( a );\n	}\n	float h0( float a ) {\n		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );\n	}\n	float h1( float a ) {\n		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );\n	}\n	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {\n		uv = uv * texelSize.zw + 0.5;\n		vec2 iuv = floor( uv );\n		vec2 fuv = fract( uv );\n		float g0x = g0( fuv.x );\n		float g1x = g1( fuv.x );\n		float h0x = h0( fuv.x );\n		float h1x = h1( fuv.x );\n		float h0y = h0( fuv.y );\n		float h1y = h1( fuv.y );\n		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;\n		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;\n		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;\n		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;\n		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +\n			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );\n	}\n	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {\n		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );\n		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );\n		vec2 fLodSizeInv = 1.0 / fLodSize;\n		vec2 cLodSizeInv = 1.0 / cLodSize;\n		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );\n		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );\n		return mix( fSample, cSample, fract( lod ) );\n	}\n	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {\n		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );\n		vec3 modelScale;\n		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );\n		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );\n		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );\n		return normalize( refractionVector ) * thickness * modelScale;\n	}\n	float applyIorToRoughness( const in float roughness, const in float ior ) {\n		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );\n	}\n	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {\n		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );\n		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );\n	}\n	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {\n		if ( isinf( attenuationDistance ) ) {\n			return vec3( 1.0 );\n		} else {\n			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;\n			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;\n		}\n	}\n	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,\n		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,\n		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,\n		const in vec3 attenuationColor, const in float attenuationDistance ) {\n		vec4 transmittedLight;\n		vec3 transmittance;\n		#ifdef USE_DISPERSION\n			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;\n			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );\n			for ( int i = 0; i < 3; i ++ ) {\n				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );\n				vec3 refractedRayExit = position + transmissionRay;\n				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );\n				vec2 refractionCoords = ndcPos.xy / ndcPos.w;\n				refractionCoords += 1.0;\n				refractionCoords /= 2.0;\n				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );\n				transmittedLight[ i ] = transmissionSample[ i ];\n				transmittedLight.a += transmissionSample.a;\n				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];\n			}\n			transmittedLight.a /= 3.0;\n		#else\n			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );\n			vec3 refractedRayExit = position + transmissionRay;\n			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );\n			vec2 refractionCoords = ndcPos.xy / ndcPos.w;\n			refractionCoords += 1.0;\n			refractionCoords /= 2.0;\n			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );\n			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );\n		#endif\n		vec3 attenuatedColor = transmittance * transmittedLight.rgb;\n		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );\n		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;\n		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );\n	}\n#endif";
var uv_pars_fragment = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	varying vec2 vUv;\n#endif\n#ifdef USE_MAP\n	varying vec2 vMapUv;\n#endif\n#ifdef USE_ALPHAMAP\n	varying vec2 vAlphaMapUv;\n#endif\n#ifdef USE_LIGHTMAP\n	varying vec2 vLightMapUv;\n#endif\n#ifdef USE_AOMAP\n	varying vec2 vAoMapUv;\n#endif\n#ifdef USE_BUMPMAP\n	varying vec2 vBumpMapUv;\n#endif\n#ifdef USE_NORMALMAP\n	varying vec2 vNormalMapUv;\n#endif\n#ifdef USE_EMISSIVEMAP\n	varying vec2 vEmissiveMapUv;\n#endif\n#ifdef USE_METALNESSMAP\n	varying vec2 vMetalnessMapUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	varying vec2 vRoughnessMapUv;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	varying vec2 vAnisotropyMapUv;\n#endif\n#ifdef USE_CLEARCOATMAP\n	varying vec2 vClearcoatMapUv;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	varying vec2 vClearcoatNormalMapUv;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	varying vec2 vClearcoatRoughnessMapUv;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	varying vec2 vIridescenceMapUv;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	varying vec2 vIridescenceThicknessMapUv;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	varying vec2 vSheenColorMapUv;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	varying vec2 vSheenRoughnessMapUv;\n#endif\n#ifdef USE_SPECULARMAP\n	varying vec2 vSpecularMapUv;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	varying vec2 vSpecularColorMapUv;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	varying vec2 vSpecularIntensityMapUv;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	uniform mat3 transmissionMapTransform;\n	varying vec2 vTransmissionMapUv;\n#endif\n#ifdef USE_THICKNESSMAP\n	uniform mat3 thicknessMapTransform;\n	varying vec2 vThicknessMapUv;\n#endif";
var uv_pars_vertex = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	varying vec2 vUv;\n#endif\n#ifdef USE_MAP\n	uniform mat3 mapTransform;\n	varying vec2 vMapUv;\n#endif\n#ifdef USE_ALPHAMAP\n	uniform mat3 alphaMapTransform;\n	varying vec2 vAlphaMapUv;\n#endif\n#ifdef USE_LIGHTMAP\n	uniform mat3 lightMapTransform;\n	varying vec2 vLightMapUv;\n#endif\n#ifdef USE_AOMAP\n	uniform mat3 aoMapTransform;\n	varying vec2 vAoMapUv;\n#endif\n#ifdef USE_BUMPMAP\n	uniform mat3 bumpMapTransform;\n	varying vec2 vBumpMapUv;\n#endif\n#ifdef USE_NORMALMAP\n	uniform mat3 normalMapTransform;\n	varying vec2 vNormalMapUv;\n#endif\n#ifdef USE_DISPLACEMENTMAP\n	uniform mat3 displacementMapTransform;\n	varying vec2 vDisplacementMapUv;\n#endif\n#ifdef USE_EMISSIVEMAP\n	uniform mat3 emissiveMapTransform;\n	varying vec2 vEmissiveMapUv;\n#endif\n#ifdef USE_METALNESSMAP\n	uniform mat3 metalnessMapTransform;\n	varying vec2 vMetalnessMapUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	uniform mat3 roughnessMapTransform;\n	varying vec2 vRoughnessMapUv;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	uniform mat3 anisotropyMapTransform;\n	varying vec2 vAnisotropyMapUv;\n#endif\n#ifdef USE_CLEARCOATMAP\n	uniform mat3 clearcoatMapTransform;\n	varying vec2 vClearcoatMapUv;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	uniform mat3 clearcoatNormalMapTransform;\n	varying vec2 vClearcoatNormalMapUv;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	uniform mat3 clearcoatRoughnessMapTransform;\n	varying vec2 vClearcoatRoughnessMapUv;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	uniform mat3 sheenColorMapTransform;\n	varying vec2 vSheenColorMapUv;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	uniform mat3 sheenRoughnessMapTransform;\n	varying vec2 vSheenRoughnessMapUv;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	uniform mat3 iridescenceMapTransform;\n	varying vec2 vIridescenceMapUv;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	uniform mat3 iridescenceThicknessMapTransform;\n	varying vec2 vIridescenceThicknessMapUv;\n#endif\n#ifdef USE_SPECULARMAP\n	uniform mat3 specularMapTransform;\n	varying vec2 vSpecularMapUv;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	uniform mat3 specularColorMapTransform;\n	varying vec2 vSpecularColorMapUv;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	uniform mat3 specularIntensityMapTransform;\n	varying vec2 vSpecularIntensityMapUv;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	uniform mat3 transmissionMapTransform;\n	varying vec2 vTransmissionMapUv;\n#endif\n#ifdef USE_THICKNESSMAP\n	uniform mat3 thicknessMapTransform;\n	varying vec2 vThicknessMapUv;\n#endif";
var uv_vertex = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	vUv = vec3( uv, 1 ).xy;\n#endif\n#ifdef USE_MAP\n	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ALPHAMAP\n	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_LIGHTMAP\n	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_AOMAP\n	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_BUMPMAP\n	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_NORMALMAP\n	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_DISPLACEMENTMAP\n	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_EMISSIVEMAP\n	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_METALNESSMAP\n	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOATMAP\n	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULARMAP\n	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_THICKNESSMAP\n	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;\n#endif";
var worldpos_vertex = "#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\n	vec4 worldPosition = vec4( transformed, 1.0 );\n	#ifdef USE_BATCHING\n		worldPosition = batchingMatrix * worldPosition;\n	#endif\n	#ifdef USE_INSTANCING\n		worldPosition = instanceMatrix * worldPosition;\n	#endif\n	worldPosition = modelMatrix * worldPosition;\n#endif";
var vertex$h = "varying vec2 vUv;\nuniform mat3 uvTransform;\nvoid main() {\n	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\n	gl_Position = vec4( position.xy, 1.0, 1.0 );\n}";
var fragment$h = "uniform sampler2D t2D;\nuniform float backgroundIntensity;\nvarying vec2 vUv;\nvoid main() {\n	vec4 texColor = texture2D( t2D, vUv );\n	#ifdef DECODE_VIDEO_TEXTURE\n		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );\n	#endif\n	texColor.rgb *= backgroundIntensity;\n	gl_FragColor = texColor;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$g = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n	gl_Position.z = gl_Position.w;\n}";
var fragment$g = "#ifdef ENVMAP_TYPE_CUBE\n	uniform samplerCube envMap;\n#elif defined( ENVMAP_TYPE_CUBE_UV )\n	uniform sampler2D envMap;\n#endif\nuniform float flipEnvMap;\nuniform float backgroundBlurriness;\nuniform float backgroundIntensity;\nuniform mat3 backgroundRotation;\nvarying vec3 vWorldDirection;\n#include <cube_uv_reflection_fragment>\nvoid main() {\n	#ifdef ENVMAP_TYPE_CUBE\n		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );\n	#elif defined( ENVMAP_TYPE_CUBE_UV )\n		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );\n	#else\n		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );\n	#endif\n	texColor.rgb *= backgroundIntensity;\n	gl_FragColor = texColor;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$f = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n	gl_Position.z = gl_Position.w;\n}";
var fragment$f = "uniform samplerCube tCube;\nuniform float tFlip;\nuniform float opacity;\nvarying vec3 vWorldDirection;\nvoid main() {\n	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );\n	gl_FragColor = texColor;\n	gl_FragColor.a *= opacity;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$e = "#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvarying vec2 vHighPrecisionZW;\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <skinbase_vertex>\n	#include <morphinstance_vertex>\n	#ifdef USE_DISPLACEMENTMAP\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vHighPrecisionZW = gl_Position.zw;\n}";
var fragment$e = "#if DEPTH_PACKING == 3200\n	uniform float opacity;\n#endif\n#include <common>\n#include <packing>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvarying vec2 vHighPrecisionZW;\nvoid main() {\n	vec4 diffuseColor = vec4( 1.0 );\n	#include <clipping_planes_fragment>\n	#if DEPTH_PACKING == 3200\n		diffuseColor.a = opacity;\n	#endif\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <logdepthbuf_fragment>\n	#ifdef USE_REVERSED_DEPTH_BUFFER\n		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];\n	#else\n		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;\n	#endif\n	#if DEPTH_PACKING == 3200\n		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );\n	#elif DEPTH_PACKING == 3201\n		gl_FragColor = packDepthToRGBA( fragCoordZ );\n	#elif DEPTH_PACKING == 3202\n		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );\n	#elif DEPTH_PACKING == 3203\n		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );\n	#endif\n}";
var vertex$d = "#define DISTANCE\nvarying vec3 vWorldPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <skinbase_vertex>\n	#include <morphinstance_vertex>\n	#ifdef USE_DISPLACEMENTMAP\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <worldpos_vertex>\n	#include <clipping_planes_vertex>\n	vWorldPosition = worldPosition.xyz;\n}";
var fragment$d = "#define DISTANCE\nuniform vec3 referencePosition;\nuniform float nearDistance;\nuniform float farDistance;\nvarying vec3 vWorldPosition;\n#include <common>\n#include <packing>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main () {\n	vec4 diffuseColor = vec4( 1.0 );\n	#include <clipping_planes_fragment>\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	float dist = length( vWorldPosition - referencePosition );\n	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );\n	dist = saturate( dist );\n	gl_FragColor = packDepthToRGBA( dist );\n}";
var vertex$c = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n}";
var fragment$c = "uniform sampler2D tEquirect;\nvarying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vec3 direction = normalize( vWorldDirection );\n	vec2 sampleUV = equirectUv( direction );\n	gl_FragColor = texture2D( tEquirect, sampleUV );\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$b = "uniform float scale;\nattribute float lineDistance;\nvarying float vLineDistance;\n#include <common>\n#include <uv_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	vLineDistance = scale * lineDistance;\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n}";
var fragment$b = "uniform vec3 diffuse;\nuniform float opacity;\nuniform float dashSize;\nuniform float totalSize;\nvarying float vLineDistance;\n#include <common>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	if ( mod( vLineDistance, totalSize ) > dashSize ) {\n		discard;\n	}\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n}";
var vertex$a = "#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinbase_vertex>\n		#include <skinnormal_vertex>\n		#include <defaultnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$a = "uniform vec3 diffuse;\nuniform float opacity;\n#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n#endif\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	#ifdef USE_LIGHTMAP\n		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );\n		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;\n	#else\n		reflectedLight.indirectDiffuse += vec3( 1.0 );\n	#endif\n	#include <aomap_fragment>\n	reflectedLight.indirectDiffuse *= diffuseColor.rgb;\n	vec3 outgoingLight = reflectedLight.indirectDiffuse;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$9 = "#define LAMBERT\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$9 = "#define LAMBERT\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_lambert_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_lambert_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$8 = "#define MATCAP\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <color_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n	vViewPosition = - mvPosition.xyz;\n}";
var fragment$8 = "#define MATCAP\nuniform vec3 diffuse;\nuniform float opacity;\nuniform sampler2D matcap;\nvarying vec3 vViewPosition;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <normal_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	vec3 viewDir = normalize( vViewPosition );\n	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );\n	vec3 y = cross( viewDir, x );\n	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;\n	#ifdef USE_MATCAP\n		vec4 matcapColor = texture2D( matcap, uv );\n	#else\n		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );\n	#endif\n	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$7 = "#define NORMAL\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	varying vec3 vViewPosition;\n#endif\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	vViewPosition = - mvPosition.xyz;\n#endif\n}";
var fragment$7 = "#define NORMAL\nuniform float opacity;\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	varying vec3 vViewPosition;\n#endif\n#include <packing>\n#include <uv_pars_fragment>\n#include <normal_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );\n	#ifdef OPAQUE\n		gl_FragColor.a = 1.0;\n	#endif\n}";
var vertex$6 = "#define PHONG\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$6 = "#define PHONG\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform vec3 specular;\nuniform float shininess;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_phong_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_phong_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$5 = "#define STANDARD\nvarying vec3 vViewPosition;\n#ifdef USE_TRANSMISSION\n	varying vec3 vWorldPosition;\n#endif\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n#ifdef USE_TRANSMISSION\n	vWorldPosition = worldPosition.xyz;\n#endif\n}";
var fragment$5 = "#define STANDARD\n#ifdef PHYSICAL\n	#define IOR\n	#define USE_SPECULAR\n#endif\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float roughness;\nuniform float metalness;\nuniform float opacity;\n#ifdef IOR\n	uniform float ior;\n#endif\n#ifdef USE_SPECULAR\n	uniform float specularIntensity;\n	uniform vec3 specularColor;\n	#ifdef USE_SPECULAR_COLORMAP\n		uniform sampler2D specularColorMap;\n	#endif\n	#ifdef USE_SPECULAR_INTENSITYMAP\n		uniform sampler2D specularIntensityMap;\n	#endif\n#endif\n#ifdef USE_CLEARCOAT\n	uniform float clearcoat;\n	uniform float clearcoatRoughness;\n#endif\n#ifdef USE_DISPERSION\n	uniform float dispersion;\n#endif\n#ifdef USE_IRIDESCENCE\n	uniform float iridescence;\n	uniform float iridescenceIOR;\n	uniform float iridescenceThicknessMinimum;\n	uniform float iridescenceThicknessMaximum;\n#endif\n#ifdef USE_SHEEN\n	uniform vec3 sheenColor;\n	uniform float sheenRoughness;\n	#ifdef USE_SHEEN_COLORMAP\n		uniform sampler2D sheenColorMap;\n	#endif\n	#ifdef USE_SHEEN_ROUGHNESSMAP\n		uniform sampler2D sheenRoughnessMap;\n	#endif\n#endif\n#ifdef USE_ANISOTROPY\n	uniform vec2 anisotropyVector;\n	#ifdef USE_ANISOTROPYMAP\n		uniform sampler2D anisotropyMap;\n	#endif\n#endif\nvarying vec3 vViewPosition;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <iridescence_fragment>\n#include <cube_uv_reflection_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_physical_pars_fragment>\n#include <fog_pars_fragment>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_physical_pars_fragment>\n#include <transmission_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <clearcoat_pars_fragment>\n#include <iridescence_pars_fragment>\n#include <roughnessmap_pars_fragment>\n#include <metalnessmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <roughnessmap_fragment>\n	#include <metalnessmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <clearcoat_normal_fragment_begin>\n	#include <clearcoat_normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_physical_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;\n	#include <transmission_fragment>\n	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\n	#ifdef USE_SHEEN\n		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );\n		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;\n	#endif\n	#ifdef USE_CLEARCOAT\n		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );\n		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );\n		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;\n	#endif\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$4 = "#define TOON\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$4 = "#define TOON\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <gradientmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_toon_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_toon_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$3 = "uniform float size;\nuniform float scale;\n#include <common>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\n#ifdef USE_POINTS_UV\n	varying vec2 vUv;\n	uniform mat3 uvTransform;\n#endif\nvoid main() {\n	#ifdef USE_POINTS_UV\n		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\n	#endif\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <project_vertex>\n	gl_PointSize = size;\n	#ifdef USE_SIZEATTENUATION\n		bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );\n	#endif\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <worldpos_vertex>\n	#include <fog_vertex>\n}";
var fragment$3 = "uniform vec3 diffuse;\nuniform float opacity;\n#include <common>\n#include <color_pars_fragment>\n#include <map_particle_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_particle_fragment>\n	#include <color_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n}";
var vertex$2 = "#include <common>\n#include <batching_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <shadowmap_pars_vertex>\nvoid main() {\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$2 = "uniform vec3 color;\nuniform float opacity;\n#include <common>\n#include <packing>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <logdepthbuf_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>\nvoid main() {\n	#include <logdepthbuf_fragment>\n	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n}";
var vertex$1 = "uniform float rotation;\nuniform vec2 center;\n#include <common>\n#include <uv_pars_vertex>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	vec4 mvPosition = modelViewMatrix[ 3 ];\n	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );\n	#ifndef USE_SIZEATTENUATION\n		bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n		if ( isPerspective ) scale *= - mvPosition.z;\n	#endif\n	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;\n	vec2 rotatedPosition;\n	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;\n	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;\n	mvPosition.xy += rotatedPosition;\n	gl_Position = projectionMatrix * mvPosition;\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n}";
var fragment$1 = "uniform vec3 diffuse;\nuniform float opacity;\n#include <common>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n}";
var ShaderChunk = {
  alphahash_fragment,
  alphahash_pars_fragment,
  alphamap_fragment,
  alphamap_pars_fragment,
  alphatest_fragment,
  alphatest_pars_fragment,
  aomap_fragment,
  aomap_pars_fragment,
  batching_pars_vertex,
  batching_vertex,
  begin_vertex,
  beginnormal_vertex,
  bsdfs,
  iridescence_fragment,
  bumpmap_pars_fragment,
  clipping_planes_fragment,
  clipping_planes_pars_fragment,
  clipping_planes_pars_vertex,
  clipping_planes_vertex,
  color_fragment,
  color_pars_fragment,
  color_pars_vertex,
  color_vertex,
  common,
  cube_uv_reflection_fragment,
  defaultnormal_vertex,
  displacementmap_pars_vertex,
  displacementmap_vertex,
  emissivemap_fragment,
  emissivemap_pars_fragment,
  colorspace_fragment,
  colorspace_pars_fragment,
  envmap_fragment,
  envmap_common_pars_fragment,
  envmap_pars_fragment,
  envmap_pars_vertex,
  envmap_physical_pars_fragment,
  envmap_vertex,
  fog_vertex,
  fog_pars_vertex,
  fog_fragment,
  fog_pars_fragment,
  gradientmap_pars_fragment,
  lightmap_pars_fragment,
  lights_lambert_fragment,
  lights_lambert_pars_fragment,
  lights_pars_begin,
  lights_toon_fragment,
  lights_toon_pars_fragment,
  lights_phong_fragment,
  lights_phong_pars_fragment,
  lights_physical_fragment,
  lights_physical_pars_fragment,
  lights_fragment_begin,
  lights_fragment_maps,
  lights_fragment_end,
  logdepthbuf_fragment,
  logdepthbuf_pars_fragment,
  logdepthbuf_pars_vertex,
  logdepthbuf_vertex,
  map_fragment,
  map_pars_fragment,
  map_particle_fragment,
  map_particle_pars_fragment,
  metalnessmap_fragment,
  metalnessmap_pars_fragment,
  morphinstance_vertex,
  morphcolor_vertex,
  morphnormal_vertex,
  morphtarget_pars_vertex,
  morphtarget_vertex,
  normal_fragment_begin,
  normal_fragment_maps,
  normal_pars_fragment,
  normal_pars_vertex,
  normal_vertex,
  normalmap_pars_fragment,
  clearcoat_normal_fragment_begin,
  clearcoat_normal_fragment_maps,
  clearcoat_pars_fragment,
  iridescence_pars_fragment,
  opaque_fragment,
  packing,
  premultiplied_alpha_fragment,
  project_vertex,
  dithering_fragment,
  dithering_pars_fragment,
  roughnessmap_fragment,
  roughnessmap_pars_fragment,
  shadowmap_pars_fragment,
  shadowmap_pars_vertex,
  shadowmap_vertex,
  shadowmask_pars_fragment,
  skinbase_vertex,
  skinning_pars_vertex,
  skinning_vertex,
  skinnormal_vertex,
  specularmap_fragment,
  specularmap_pars_fragment,
  tonemapping_fragment,
  tonemapping_pars_fragment,
  transmission_fragment,
  transmission_pars_fragment,
  uv_pars_fragment,
  uv_pars_vertex,
  uv_vertex,
  worldpos_vertex,
  background_vert: vertex$h,
  background_frag: fragment$h,
  backgroundCube_vert: vertex$g,
  backgroundCube_frag: fragment$g,
  cube_vert: vertex$f,
  cube_frag: fragment$f,
  depth_vert: vertex$e,
  depth_frag: fragment$e,
  distanceRGBA_vert: vertex$d,
  distanceRGBA_frag: fragment$d,
  equirect_vert: vertex$c,
  equirect_frag: fragment$c,
  linedashed_vert: vertex$b,
  linedashed_frag: fragment$b,
  meshbasic_vert: vertex$a,
  meshbasic_frag: fragment$a,
  meshlambert_vert: vertex$9,
  meshlambert_frag: fragment$9,
  meshmatcap_vert: vertex$8,
  meshmatcap_frag: fragment$8,
  meshnormal_vert: vertex$7,
  meshnormal_frag: fragment$7,
  meshphong_vert: vertex$6,
  meshphong_frag: fragment$6,
  meshphysical_vert: vertex$5,
  meshphysical_frag: fragment$5,
  meshtoon_vert: vertex$4,
  meshtoon_frag: fragment$4,
  points_vert: vertex$3,
  points_frag: fragment$3,
  shadow_vert: vertex$2,
  shadow_frag: fragment$2,
  sprite_vert: vertex$1,
  sprite_frag: fragment$1
};
var UniformsLib = {
  common: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    map: { value: null },
    mapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 }
  },
  specularmap: {
    specularMap: { value: null },
    specularMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  envmap: {
    envMap: { value: null },
    envMapRotation: { value: /* @__PURE__ */ new Matrix3() },
    flipEnvMap: { value: -1 },
    reflectivity: { value: 1 },
    // basic, lambert, phong
    ior: { value: 1.5 },
    // physical
    refractionRatio: { value: 0.98 }
    // basic, lambert, phong
  },
  aomap: {
    aoMap: { value: null },
    aoMapIntensity: { value: 1 },
    aoMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  lightmap: {
    lightMap: { value: null },
    lightMapIntensity: { value: 1 },
    lightMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  bumpmap: {
    bumpMap: { value: null },
    bumpMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    bumpScale: { value: 1 }
  },
  normalmap: {
    normalMap: { value: null },
    normalMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    normalScale: { value: /* @__PURE__ */ new Vector2(1, 1) }
  },
  displacementmap: {
    displacementMap: { value: null },
    displacementMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    displacementScale: { value: 1 },
    displacementBias: { value: 0 }
  },
  emissivemap: {
    emissiveMap: { value: null },
    emissiveMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  metalnessmap: {
    metalnessMap: { value: null },
    metalnessMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  roughnessmap: {
    roughnessMap: { value: null },
    roughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  gradientmap: {
    gradientMap: { value: null }
  },
  fog: {
    fogDensity: { value: 25e-5 },
    fogNear: { value: 1 },
    fogFar: { value: 2e3 },
    fogColor: { value: /* @__PURE__ */ new Color(16777215) }
  },
  lights: {
    ambientLightColor: { value: [] },
    lightProbe: { value: [] },
    directionalLights: { value: [], properties: {
      direction: {},
      color: {}
    } },
    directionalLightShadows: { value: [], properties: {
      shadowIntensity: 1,
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {}
    } },
    directionalShadowMap: { value: [] },
    directionalShadowMatrix: { value: [] },
    spotLights: { value: [], properties: {
      color: {},
      position: {},
      direction: {},
      distance: {},
      coneCos: {},
      penumbraCos: {},
      decay: {}
    } },
    spotLightShadows: { value: [], properties: {
      shadowIntensity: 1,
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {}
    } },
    spotLightMap: { value: [] },
    spotShadowMap: { value: [] },
    spotLightMatrix: { value: [] },
    pointLights: { value: [], properties: {
      color: {},
      position: {},
      decay: {},
      distance: {}
    } },
    pointLightShadows: { value: [], properties: {
      shadowIntensity: 1,
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {},
      shadowCameraNear: {},
      shadowCameraFar: {}
    } },
    pointShadowMap: { value: [] },
    pointShadowMatrix: { value: [] },
    hemisphereLights: { value: [], properties: {
      direction: {},
      skyColor: {},
      groundColor: {}
    } },
    // TODO (abelnation): RectAreaLight BRDF data needs to be moved from example to main src
    rectAreaLights: { value: [], properties: {
      color: {},
      position: {},
      width: {},
      height: {}
    } },
    ltc_1: { value: null },
    ltc_2: { value: null }
  },
  points: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    size: { value: 1 },
    scale: { value: 1 },
    map: { value: null },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 },
    uvTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  sprite: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    center: { value: /* @__PURE__ */ new Vector2(0.5, 0.5) },
    rotation: { value: 0 },
    map: { value: null },
    mapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 }
  }
};
var ShaderLib = {
  basic: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.meshbasic_vert,
    fragmentShader: ShaderChunk.meshbasic_frag
  },
  lambert: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) }
      }
    ]),
    vertexShader: ShaderChunk.meshlambert_vert,
    fragmentShader: ShaderChunk.meshlambert_frag
  },
  phong: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) },
        specular: { value: /* @__PURE__ */ new Color(1118481) },
        shininess: { value: 30 }
      }
    ]),
    vertexShader: ShaderChunk.meshphong_vert,
    fragmentShader: ShaderChunk.meshphong_frag
  },
  standard: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.roughnessmap,
      UniformsLib.metalnessmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) },
        roughness: { value: 1 },
        metalness: { value: 0 },
        envMapIntensity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.meshphysical_vert,
    fragmentShader: ShaderChunk.meshphysical_frag
  },
  toon: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.gradientmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) }
      }
    ]),
    vertexShader: ShaderChunk.meshtoon_vert,
    fragmentShader: ShaderChunk.meshtoon_frag
  },
  matcap: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      {
        matcap: { value: null }
      }
    ]),
    vertexShader: ShaderChunk.meshmatcap_vert,
    fragmentShader: ShaderChunk.meshmatcap_frag
  },
  points: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.points,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.points_vert,
    fragmentShader: ShaderChunk.points_frag
  },
  dashed: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.fog,
      {
        scale: { value: 1 },
        dashSize: { value: 1 },
        totalSize: { value: 2 }
      }
    ]),
    vertexShader: ShaderChunk.linedashed_vert,
    fragmentShader: ShaderChunk.linedashed_frag
  },
  depth: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.displacementmap
    ]),
    vertexShader: ShaderChunk.depth_vert,
    fragmentShader: ShaderChunk.depth_frag
  },
  normal: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      {
        opacity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.meshnormal_vert,
    fragmentShader: ShaderChunk.meshnormal_frag
  },
  sprite: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.sprite,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.sprite_vert,
    fragmentShader: ShaderChunk.sprite_frag
  },
  background: {
    uniforms: {
      uvTransform: { value: /* @__PURE__ */ new Matrix3() },
      t2D: { value: null },
      backgroundIntensity: { value: 1 }
    },
    vertexShader: ShaderChunk.background_vert,
    fragmentShader: ShaderChunk.background_frag
  },
  backgroundCube: {
    uniforms: {
      envMap: { value: null },
      flipEnvMap: { value: -1 },
      backgroundBlurriness: { value: 0 },
      backgroundIntensity: { value: 1 },
      backgroundRotation: { value: /* @__PURE__ */ new Matrix3() }
    },
    vertexShader: ShaderChunk.backgroundCube_vert,
    fragmentShader: ShaderChunk.backgroundCube_frag
  },
  cube: {
    uniforms: {
      tCube: { value: null },
      tFlip: { value: -1 },
      opacity: { value: 1 }
    },
    vertexShader: ShaderChunk.cube_vert,
    fragmentShader: ShaderChunk.cube_frag
  },
  equirect: {
    uniforms: {
      tEquirect: { value: null }
    },
    vertexShader: ShaderChunk.equirect_vert,
    fragmentShader: ShaderChunk.equirect_frag
  },
  distanceRGBA: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.displacementmap,
      {
        referencePosition: { value: /* @__PURE__ */ new Vector3() },
        nearDistance: { value: 1 },
        farDistance: { value: 1e3 }
      }
    ]),
    vertexShader: ShaderChunk.distanceRGBA_vert,
    fragmentShader: ShaderChunk.distanceRGBA_frag
  },
  shadow: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.lights,
      UniformsLib.fog,
      {
        color: { value: /* @__PURE__ */ new Color(0) },
        opacity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.shadow_vert,
    fragmentShader: ShaderChunk.shadow_frag
  }
};
ShaderLib.physical = {
  uniforms: /* @__PURE__ */ mergeUniforms([
    ShaderLib.standard.uniforms,
    {
      clearcoat: { value: 0 },
      clearcoatMap: { value: null },
      clearcoatMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      clearcoatNormalMap: { value: null },
      clearcoatNormalMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      clearcoatNormalScale: { value: /* @__PURE__ */ new Vector2(1, 1) },
      clearcoatRoughness: { value: 0 },
      clearcoatRoughnessMap: { value: null },
      clearcoatRoughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      dispersion: { value: 0 },
      iridescence: { value: 0 },
      iridescenceMap: { value: null },
      iridescenceMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      iridescenceIOR: { value: 1.3 },
      iridescenceThicknessMinimum: { value: 100 },
      iridescenceThicknessMaximum: { value: 400 },
      iridescenceThicknessMap: { value: null },
      iridescenceThicknessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      sheen: { value: 0 },
      sheenColor: { value: /* @__PURE__ */ new Color(0) },
      sheenColorMap: { value: null },
      sheenColorMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      sheenRoughness: { value: 1 },
      sheenRoughnessMap: { value: null },
      sheenRoughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      transmission: { value: 0 },
      transmissionMap: { value: null },
      transmissionMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      transmissionSamplerSize: { value: /* @__PURE__ */ new Vector2() },
      transmissionSamplerMap: { value: null },
      thickness: { value: 0 },
      thicknessMap: { value: null },
      thicknessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      attenuationDistance: { value: 0 },
      attenuationColor: { value: /* @__PURE__ */ new Color(0) },
      specularColor: { value: /* @__PURE__ */ new Color(1, 1, 1) },
      specularColorMap: { value: null },
      specularColorMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      specularIntensity: { value: 1 },
      specularIntensityMap: { value: null },
      specularIntensityMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      anisotropyVector: { value: /* @__PURE__ */ new Vector2() },
      anisotropyMap: { value: null },
      anisotropyMapTransform: { value: /* @__PURE__ */ new Matrix3() }
    }
  ]),
  vertexShader: ShaderChunk.meshphysical_vert,
  fragmentShader: ShaderChunk.meshphysical_frag
};
var PHI = (1 + Math.sqrt(5)) / 2;
var INV_PHI = 1 / PHI;
var _axisDirections = [
  /* @__PURE__ */ new Vector3(-PHI, INV_PHI, 0),
  /* @__PURE__ */ new Vector3(PHI, INV_PHI, 0),
  /* @__PURE__ */ new Vector3(-INV_PHI, 0, PHI),
  /* @__PURE__ */ new Vector3(INV_PHI, 0, PHI),
  /* @__PURE__ */ new Vector3(0, PHI, -INV_PHI),
  /* @__PURE__ */ new Vector3(0, PHI, INV_PHI),
  /* @__PURE__ */ new Vector3(-1, 1, -1),
  /* @__PURE__ */ new Vector3(1, 1, -1),
  /* @__PURE__ */ new Vector3(-1, 1, 1),
  /* @__PURE__ */ new Vector3(1, 1, 1)
];
var mat4array = new Float32Array(16);
var mat3array = new Float32Array(9);
var mat2array = new Float32Array(4);
var reversedFuncs = {
  [NeverDepth]: AlwaysDepth,
  [LessDepth]: GreaterDepth,
  [EqualDepth]: NotEqualDepth,
  [LessEqualDepth]: GreaterEqualDepth,
  [AlwaysDepth]: NeverDepth,
  [GreaterDepth]: LessDepth,
  [NotEqualDepth]: EqualDepth,
  [GreaterEqualDepth]: LessEqualDepth
};

// src/world/city/geometry.ts
var portDirections = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  extra: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
  extra2: { x: -Math.SQRT1_2, z: Math.SQRT1_2 }
};
function portDirection(j, port) {
  const angle = j.portAngles?.[port];
  return angle === void 0 ? portDirections[port] : { x: Math.sin(angle), z: -Math.cos(angle) };
}
function portsFor(j) {
  return j.type === "divided_cross" ? ["north", "east", "south", "west", "extra", "extra2"] : j.type === "irregular" ? ["north", "east", "south", "west", "extra"] : j.type.startsWith("t_") ? ["north", "east", "west"] : ["north", "east", "south", "west"];
}
function rotatePoint(p, radians) {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
function junctionExtent(j, map) {
  let width = INTERSECTION_LANES[j.type] * 3.5;
  for (const connection of j.connections) {
    const road = map.roads.find((r) => r.id === connection.roadId);
    if (road) width = Math.max(width, road.laneCount * road.laneWidth);
  }
  return Math.max(width / 2 + 7, ...Object.values(j.approachOffsets ?? {}).map((p) => Math.max(Math.abs(p.x), Math.abs(p.z))));
}
function roadEdges(road) {
  const half = road.laneCount * road.laneWidth / 2;
  const left = -half - (road.shoulders?.left ?? 0), right = half + (road.shoulders?.right ?? 0);
  return { left, right, width: right - left };
}
function connectionPoint(j, port, map) {
  const offset = j.approachOffsets?.[port];
  if (offset) {
    const p = rotatePoint(offset, j.rotation);
    return { x: j.position.x + p.x, y: j.pavementHeights?.[port] ?? j.position.y ?? 0, z: j.position.z + p.z };
  }
  const d = rotatePoint(portDirection(j, port), j.rotation), extent = junctionExtent(j, map);
  return { x: j.position.x + d.x * extent, y: j.pavementHeights?.[port] ?? j.position.y ?? 0, z: j.position.z + d.z * extent };
}
function syncConnections(map) {
  for (const j of map.intersections) for (const c of j.connections) {
    const r = map.roads.find((r2) => r2.id === c.roadId);
    if (r) {
      const target = connectionPoint(j, c.port, map);
      const currentY = r.elevationMode === "ground" ? r.elevation ?? 0 : r.elevationMode === "elevated" ? r.elevation ?? 6 : r.centerline[c.end === "start" ? 0 : r.centerline.length - 1].y ?? 0;
      if (Math.abs(currentY - (target.y ?? 0)) > 0.01 && r.elevationMode !== "custom") {
        r.centerline = roadPoints({ ...r, curve: "polyline" });
        r.elevationMode = "custom";
      }
      r.centerline[c.end === "start" ? 0 : r.centerline.length - 1] = target;
    }
  }
  refreshPortPoses(map);
}
function refreshPortPoses(map) {
  for (const port of map.connectionPorts ?? []) {
    if (!port.position && port.heading === void 0) continue;
    const road = map.roads.find((r) => r.id === port.endpoint.roadId);
    if (!road || road.centerline.length < 2) continue;
    const pts = roadPoints(road), start = port.endpoint.end === "start", a = start ? pts[0] : pts.at(-1), b = start ? pts[1] : pts.at(-2);
    port.position = { ...a };
    port.heading = Math.atan2(a.x - b.x, -(a.z - b.z));
    port.label = directionalPortLabel(port.label, port.heading);
  }
}
function directionalPortLabel(label, heading) {
  const directions = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
  return label.replace(
    /^(North|Northeast|East|Southeast|South|Southwest|West|Northwest)\b/,
    directions[(Math.round(heading / (Math.PI / 4)) + 8) % 8]
  );
}
function roadPoints(road) {
  const points = road.centerline.map((p) => ({ ...p, y: road.elevationMode === "ground" ? road.elevation ?? 0 : road.elevationMode === "elevated" ? road.elevation ?? 6 : p.y ?? 0 }));
  if (road.curve !== "smooth" || points.length < 3) return points;
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p.x, 0, p.z)), false, "centripetal");
  const count = Math.max(8, Math.ceil(polylineLength(points) / 3));
  return curve.getPoints(count).map((p, index) => {
    const node = index / count * (points.length - 1), a = Math.min(points.length - 2, Math.floor(node)), t = node - a;
    return { x: p.x, y: points[a].y + (points[a + 1].y - points[a].y) * t, z: p.z };
  });
}
function polylineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return sum;
}
function sampleAt(points, distance2) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-8) continue;
    if (distance2 <= length || i === points.length - 1) {
      const t = Math.min(1, distance2 / length);
      return { point: { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }, tangent: { x: (b.x - a.x) / length, y: ((b.y ?? 0) - (a.y ?? 0)) / length, z: (b.z - a.z) / length } };
    }
    distance2 -= length;
  }
  return { point: points[0], tangent: { x: 0, z: -1 } };
}

// src/world/city/RoadStyles.ts
var ROAD_STYLES = [
  { id: "collector_distributor_2", roadClass: "connector", crossSection: "shouldered", label: "Collector distributor 2", type: "highway", laneCount: 2, laneWidth: 3.9, speedLimit: 70, direction: "forward", sidewalkWidth: 0, barrier: true, streetlights: false, elevation: 0, shoulders: { left: 0.75, right: 1.75 } },
  { id: "urban_auxiliary_2", roadClass: "frontage", crossSection: "street", label: "Urban frontage 2", type: "highway", laneCount: 2, laneWidth: 3.5, speedLimit: 40, direction: "forward", sidewalkWidth: 3, barrier: false, streetlights: false, elevation: 0 },
  { id: "urban_local_2", roadClass: "local", crossSection: "street", label: "Urban Local 2", type: "urban_2lane", laneCount: 2, laneWidth: 3.6, speedLimit: 30, direction: "two-way", sidewalkWidth: 2, barrier: false, streetlights: true, elevation: 0 },
  { id: "urban_street_4", roadClass: "collector", crossSection: "street", label: "Urban Street 4", type: "urban_4lane", laneCount: 4, laneWidth: 3.6, speedLimit: 40, direction: "two-way", sidewalkWidth: 2.5, barrier: false, streetlights: true, elevation: 0 },
  { id: "urban_boulevard_6", roadClass: "arterial", crossSection: "boulevard", label: "Urban Boulevard 6", type: "urban_6lane", laneCount: 6, laneWidth: 3.75, speedLimit: 60, direction: "two-way", sidewalkWidth: 3, barrier: false, streetlights: true, elevation: 0 },
  { id: "urban_expressway_6", roadClass: "expressway", crossSection: "boulevard", label: "Urban Expressway 6", type: "urban_6lane", laneCount: 6, laneWidth: 3.75, speedLimit: 80, direction: "two-way", sidewalkWidth: 0, barrier: true, streetlights: true, elevation: 0 },
  { id: "highway_6", roadClass: "expressway", crossSection: "shouldered", label: "Highway 6", type: "highway", laneCount: 6, laneWidth: 3.75, speedLimit: 100, direction: "two-way", sidewalkWidth: 0, barrier: true, streetlights: false, elevation: 0 },
  { id: "elevated_expressway_6", roadClass: "expressway", crossSection: "shouldered", label: "Elevated Expressway 6", type: "highway", laneCount: 6, laneWidth: 3.75, speedLimit: 80, direction: "two-way", sidewalkWidth: 0, barrier: true, streetlights: true, elevation: 8, shoulders: { left: 0.75, right: 1.75 } },
  { id: "ramp_1", roadClass: "ramp", crossSection: "shouldered", label: "Ramp 1", type: "ramp_1", laneCount: 1, laneWidth: 3.9, speedLimit: 40, direction: "forward", sidewalkWidth: 0, barrier: true, streetlights: false, elevation: 0, shoulders: { left: 0.75, right: 1.75 } }
];
function applyRoadStyle(road, id) {
  const s = ROAD_STYLES.find((s2) => s2.id === id);
  if (!s) throw new Error(`Unknown road style: ${id}`);
  Object.assign(road, {
    styleId: s.id,
    type: s.type,
    laneCount: s.laneCount,
    laneWidth: s.laneWidth,
    speedLimit: s.speedLimit,
    shoulders: s.shoulders ? { ...s.shoulders } : void 0,
    travelDirection: s.direction,
    sidewalk: { enabled: s.sidewalkWidth > 0, width: s.sidewalkWidth || 2.5 },
    markings: true,
    curb: s.sidewalkWidth > 0,
    streetlights: s.streetlights,
    elevationMode: s.elevation > 0 ? "elevated" : "ground",
    elevation: s.elevation,
    structure: { barrierEnabled: s.barrier, pierSpacing: 30, pierStyle: "round", piersEnabled: true, barrierOffset: s.shoulders ? 0.25 : 0 }
  });
  road.centerline.forEach((p) => {
    p.y = s.elevation;
  });
  road.roadClass = s.roadClass;
  road.crossSection = s.crossSection;
}

// src/world/city/RoadCrossSection.ts
var ROAD_CROSS_SECTIONS = {
  street: { laneCount: 2, laneWidth: 3.6, sidewalk: { enabled: true, width: 2 }, curb: true, shoulders: { left: 0, right: 0 } },
  boulevard: { laneCount: 6, laneWidth: 3.75, sidewalk: { enabled: true, width: 3 }, curb: true, shoulders: { left: 0, right: 0 } },
  shouldered: { laneCount: 3, laneWidth: 3.75, sidewalk: { enabled: false, width: 2 }, curb: false, shoulders: { left: 0.75, right: 1.75 } }
};
function applyRoadCrossSection(road, id) {
  const preset2 = ROAD_CROSS_SECTIONS[id];
  Object.assign(road, preset2, { crossSection: id, sidewalk: { ...preset2.sidewalk }, shoulders: { ...preset2.shoulders } });
}

// src/world/city/presets/catalog.json
var catalog_default = {
  schemaVersion: 2,
  units: {
    position: "metres",
    rotation: "radians",
    footprint: "width X \xD7 depth Z metres"
  },
  parameters: {
    position: {
      default: {
        x: 0,
        y: 0,
        z: 0
      }
    },
    rotation: {
      default: 0
    },
    mainRoadLanes: {
      default: 6,
      values: [
        4,
        6
      ]
    },
    crossRoadLanes: {
      default: 4,
      values: [
        4,
        6
      ]
    },
    mainElevation: {
      default: 8,
      range: [
        5,
        12
      ]
    },
    rampLaneCount: {
      default: 1,
      values: [
        1,
        2
      ]
    },
    rampRadius: {
      default: 100,
      range: [
        40,
        100
      ]
    }
  },
  presets: [
    {
      id: "system_compact_x",
      category: "INTERCHANGE",
      description: "Layered X-shaped urban system, four semi-direct left turns and four short right turns",
      footprint: [
        300,
        300
      ],
      parameters: [
        "position",
        "rotation",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "mainApproach",
        "rightApproach"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Compact core with parallel grade transition approaches; through roads remain map-owned.",
      production: true
    },
    {
      id: "system_compact_turbine",
      category: "INTERCHANGE",
      description: "Compact turbine with four continuous swirling left turns",
      footprint: [
        320,
        320
      ],
      parameters: [
        "position",
        "rotation",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "mainApproach",
        "rightApproach"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Separate crossing decks, never connect projected ramp crossings.",
      production: true
    },
    {
      id: "system_compact_star",
      category: "INTERCHANGE",
      description: "Symmetric four-star with four directional left turns",
      footprint: [
        320,
        320
      ],
      parameters: [
        "position",
        "rotation",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "mainApproach",
        "rightApproach"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Orderly four-way directional urban connection.",
      production: true
    },
    {
      id: "system_compact_cloverleaf",
      category: "INTERCHANGE",
      description: "Four real circular 38\u201340m urban cloverleaf loops",
      footprint: [
        280,
        280
      ],
      parameters: [
        "position",
        "rotation",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "rampRadius",
        "rightApproach"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Loop entry is after the main crossing; preserve directed lane connectivity.",
      production: true
    },
    {
      id: "system_compact_hybrid",
      category: "INTERCHANGE",
      description: "Two circular compact loops and two layered semi-direct left turns",
      footprint: [
        320,
        320
      ],
      parameters: [
        "position",
        "rotation",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "rampRadius",
        "rightApproach"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Compact full-movement modified cloverleaf / parclo hybrid.",
      production: true
    },
    {
      id: "urban_side_access",
      category: "INTERCHANGE",
      description: "Same-direction side on/off ramps and short two-lane frontage roads; no signalized ramp terminal",
      footprint: [
        100,
        900
      ],
      parameters: [
        "position",
        "rotation",
        "length",
        "mainElevation",
        "mainProfile",
        "profileInterpolation"
      ],
      ports: [
        "Expressway On",
        "Expressway Off",
        "Frontage In",
        "Frontage Out"
      ],
      usage: "Connect only expressway ports to the divided mainline; frontage is ordinary local access.",
      production: true
    },
    {
      id: "peripheral_motorway_junction",
      category: "INTERCHANGE",
      description: "Open motorway T junction: two cloverleaf left turns and two broad outer right turns",
      footprint: [
        1600,
        1e3
      ],
      parameters: [
        "position",
        "rotation",
        "designProfile",
        "mainApproach",
        "crossApproach",
        "crossCarriagewayOffset",
        "rampRadius",
        "mainProfile",
        "crossProfile",
        "profileInterpolation"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Peripheral Ring to motorway connection; retain all four directional movements without a west motorway extension.",
      production: true
    },
    {
      id: "signal_cross_channelized_6x6",
      category: "INTERSECTION",
      description: "Six-lane signal cross with corner channelization islands",
      footprint: [
        470,
        470
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [
        "North",
        "East",
        "South",
        "West"
      ],
      usage: "Standard large urban junction with raised and collided corner islands.",
      production: true
    },
    {
      id: "system_cloverleaf",
      category: "INTERCHANGE",
      description: "Ramp-only full cloverleaf with elongated 45\u201365m bend loops and 250m weaving",
      footprint: [
        1230,
        1230
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "profileInterpolation",
        "rampRadius"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "Attach each movement port to an explicitly split divided corridor; crossings never create topology.",
      production: true
    },
    {
      id: "system_cloverleaf_cd",
      category: "INTERCHANGE",
      description: "Full cloverleaf with a two-lane collector distributor pair",
      footprint: [
        1230,
        1230
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "profileInterpolation",
        "rampRadius",
        "collectorAxis"
      ],
      ports: [
        "Movement In",
        "Movement Out",
        "Collector In",
        "Collector Out"
      ],
      usage: "Loop traffic weaves on 700m parallel C-D roads; mainline merge tapers are outside the weaving section.",
      production: true
    },
    {
      id: "system_cloverstack_lite",
      category: "INTERCHANGE",
      description: "Two cloverleaf loops, two 120m directional crossovers and four right turns",
      footprint: [
        1730,
        1230
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "profileInterpolation",
        "rampRadius"
      ],
      ports: [
        "Movement In",
        "Movement Out"
      ],
      usage: "A simple third deck over the other expressway, with separated opposing directional arcs.",
      production: true
    },
    {
      id: "system_parclo_cd",
      category: "INTERCHANGE",
      description: "Full-movement partial cloverleaf with long crossover left turns and C-D roads",
      footprint: [
        1730,
        1230
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "crossElevation",
        "mainProfile",
        "crossProfile",
        "profileInterpolation",
        "rampRadius",
        "collectorAxis"
      ],
      ports: [
        "Movement In",
        "Movement Out",
        "Collector In",
        "Collector Out"
      ],
      usage: "Two loops and two long outer crossovers preserve all eight turning movements.",
      production: true
    },
    {
      id: "divided_tunnel",
      category: "ROAD",
      description: "Two physically separated three-lane tunnel bores with six metres clear height",
      footprint: [
        34,
        550
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "length"
      ],
      ports: [
        "North In",
        "North Out",
        "South In",
        "South Out"
      ],
      usage: "Stamp at the underground floor elevation and join approach endpoints.",
      production: true
    },
    {
      id: "urban_underpass",
      category: "ROAD",
      description: "Roofed urban road under a static infrastructure corridor",
      footprint: [
        30,
        110
      ],
      parameters: [
        "position",
        "rotation",
        "length"
      ],
      ports: [
        "South In",
        "North Out"
      ],
      usage: "Six metre clear roof, retaining walls and editable approach ports.",
      production: true
    },
    {
      id: "urban_main_aux",
      category: "ROAD",
      description: "Six-lane divided boulevard with two outer two-lane frontage roads",
      footprint: [
        80,
        1800
      ],
      parameters: [
        "position",
        "rotation",
        "length"
      ],
      ports: [
        "South Main",
        "North Main",
        "Frontage In",
        "Frontage Out"
      ],
      usage: "Add local access on frontage roads and infrequent explicit main/frontage transitions.",
      production: true
    },
    {
      id: "urban_overpass",
      category: "INTERCHANGE",
      description: "Two-way N/S urban deck over an independent E/W ground street",
      footprint: [
        630,
        1230
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation"
      ],
      ports: [
        "North Mainline",
        "South Mainline",
        "East Crossroad",
        "West Crossroad"
      ],
      usage: "Grade-separated urban crossing; end ramps return the main road to ground.",
      production: true,
      layout: "Two-way N/S urban deck over an independent E/W ground street",
      specification: {
        laneWidths: [
          3.75,
          3.6
        ],
        pavedWidths: [
          25,
          14.4
        ],
        elevation: [
          0,
          8
        ],
        maximumGradePercent: 3.7,
        minimumCurveRadius: null,
        ports: [
          {
            label: "South Mainline",
            position: {
              x: 0,
              y: 0,
              z: 600
            },
            heading: 3.141592653589793
          },
          {
            label: "North Mainline",
            position: {
              x: 0,
              y: 0,
              z: -600
            },
            heading: 0
          },
          {
            label: "West Crossroad",
            position: {
              x: -300,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          },
          {
            label: "East Crossroad",
            position: {
              x: 300,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          }
        ]
      }
    },
    {
      id: "diamond_interchange",
      category: "INTERCHANGE",
      description: "Two N/S one-way carriageways; E/W ground crossroad; four directional ramps",
      footprint: [
        1230,
        1230
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "rampLaneCount",
        "rampRadius",
        "length"
      ],
      ports: [
        "North Mainline In",
        "North Mainline Out",
        "South Mainline In",
        "South Mainline Out",
        "East Crossroad",
        "West Crossroad"
      ],
      usage: "Compact interchange joining the mainline to a local crossroad.",
      production: true,
      layout: "Two N/S one-way carriageways; E/W ground crossroad; four directional ramps",
      specification: {
        laneWidths: [
          3.75,
          3.6,
          3.9
        ],
        pavedWidths: [
          13.75,
          14.4,
          6.4
        ],
        elevation: [
          0,
          8
        ],
        maximumGradePercent: 4.13,
        minimumCurveRadius: 148.2,
        ports: [
          {
            label: "South Mainline In",
            position: {
              x: 8.125,
              y: 8,
              z: 600
            },
            heading: 3.141592653589793
          },
          {
            label: "North Mainline Out",
            position: {
              x: 8.125,
              y: 8,
              z: -600
            },
            heading: 0
          },
          {
            label: "North Mainline In",
            position: {
              x: -8.125,
              y: 8,
              z: -600
            },
            heading: 0
          },
          {
            label: "South Mainline Out",
            position: {
              x: -8.125,
              y: 8,
              z: 600
            },
            heading: 3.141592653589793
          },
          {
            label: "West Crossroad",
            position: {
              x: -600,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          },
          {
            label: "East Crossroad",
            position: {
              x: 600,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          }
        ]
      }
    },
    {
      id: "cloverleaf_interchange",
      category: "INTERCHANGE",
      description: "Two divided highways; N/S upper layer and E/W ground layer; four outer turns and four loops",
      footprint: [
        2070,
        2070
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "rampLaneCount",
        "rampRadius"
      ],
      ports: [
        "North Mainline In",
        "North Mainline Out",
        "South Mainline In",
        "South Mainline Out",
        "East Crossroad In",
        "East Crossroad Out",
        "West Crossroad In",
        "West Crossroad Out"
      ],
      usage: "Broad outer connectors enclosing 80\u2013100m loops; allow a full 2km site.",
      production: true,
      layout: "Two divided highways; N/S upper layer and E/W ground layer; four outer turns and four loops",
      specification: {
        laneWidths: [
          3.75,
          3.9
        ],
        pavedWidths: [
          13.75,
          10,
          6.4
        ],
        elevation: [
          0,
          8
        ],
        maximumGradePercent: 4.24,
        minimumCurveRadius: 100,
        ports: [
          {
            label: "South Mainline In",
            position: {
              x: 8.125,
              y: 8,
              z: 1020
            },
            heading: 3.141592653589793
          },
          {
            label: "North Mainline Out",
            position: {
              x: 8.125,
              y: 8,
              z: -1020
            },
            heading: 0
          },
          {
            label: "North Mainline In",
            position: {
              x: -8.125,
              y: 8,
              z: -1020
            },
            heading: 0
          },
          {
            label: "South Mainline Out",
            position: {
              x: -8.125,
              y: 8,
              z: 1020
            },
            heading: 3.141592653589793
          },
          {
            label: "West Crossroad In",
            position: {
              x: -1020,
              y: 0,
              z: 6.25
            },
            heading: -1.5707963267948966
          },
          {
            label: "East Crossroad Out",
            position: {
              x: 1020,
              y: 0,
              z: 6.25
            },
            heading: 1.5707963267948966
          },
          {
            label: "East Crossroad In",
            position: {
              x: 1020,
              y: 0,
              z: -6.25
            },
            heading: 1.5707963267948966
          },
          {
            label: "West Crossroad Out",
            position: {
              x: -1020,
              y: 0,
              z: -6.25
            },
            heading: -1.5707963267948966
          }
        ]
      }
    },
    {
      id: "trumpet_interchange",
      category: "INTERCHANGE",
      description: "Divided N/S mainline and eastern terminating divided branch; two direct turns and two loops",
      footprint: [
        2070,
        2070
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "crossRoadLanes",
        "mainElevation",
        "rampLaneCount",
        "rampRadius"
      ],
      ports: [
        "North Mainline In",
        "North Mainline Out",
        "South Mainline In",
        "South Mainline Out",
        "East Branch In",
        "East Branch Out"
      ],
      usage: "Broad outer connectors enclosing 80\u2013100m loops; allow a full 2km site.",
      production: true,
      layout: "Divided N/S mainline and eastern terminating divided branch; two direct turns and two loops",
      specification: {
        laneWidths: [
          3.75,
          3.9
        ],
        pavedWidths: [
          13.75,
          10,
          6.4
        ],
        elevation: [
          0,
          8
        ],
        maximumGradePercent: 4.24,
        minimumCurveRadius: 100,
        ports: [
          {
            label: "South Mainline In",
            position: {
              x: 8.125,
              y: 8,
              z: 1020
            },
            heading: 3.141592653589793
          },
          {
            label: "North Mainline Out",
            position: {
              x: 8.125,
              y: 8,
              z: -1020
            },
            heading: 0
          },
          {
            label: "North Mainline In",
            position: {
              x: -8.125,
              y: 8,
              z: -1020
            },
            heading: 0
          },
          {
            label: "South Mainline Out",
            position: {
              x: -8.125,
              y: 8,
              z: 1020
            },
            heading: 3.141592653589793
          },
          {
            label: "East Branch Out",
            position: {
              x: 1020,
              y: 0,
              z: 6.25
            },
            heading: 1.5707963267948966
          },
          {
            label: "East Branch In",
            position: {
              x: 1020,
              y: 0,
              z: -6.25
            },
            heading: 1.5707963267948966
          }
        ]
      }
    },
    {
      id: "roundabout",
      category: "INTERSECTION",
      description: "One-way counterclockwise ring, four separated entry/exit pairs",
      footprint: [
        500,
        500
      ],
      parameters: [
        "position",
        "rotation",
        "rampLaneCount",
        "rampRadius"
      ],
      ports: [
        "North In",
        "North Out",
        "East In",
        "East Out",
        "South In",
        "South Out",
        "West In",
        "West Out"
      ],
      usage: "Low-speed roundabout; explicit links at ring entry/exit nodes.",
      production: true,
      layout: "One-way counterclockwise ring, four separated entry/exit pairs",
      specification: {
        laneWidths: [
          3.9
        ],
        pavedWidths: [
          6.4
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: 17.1,
        ports: [
          {
            label: "North In",
            position: {
              x: -4.949999999999985,
              y: 0,
              z: -240
            },
            heading: 0.0026606572553845007
          },
          {
            label: "North Out",
            position: {
              x: 4.950000000000015,
              y: 0,
              z: -240
            },
            heading: -0.0026606572553842683
          },
          {
            label: "West In",
            position: {
              x: -240,
              y: 0,
              z: 4.949999999999971
            },
            heading: -1.568135669539512
          },
          {
            label: "West Out",
            position: {
              x: -240,
              y: 0,
              z: -4.9500000000000295
            },
            heading: -1.573456984050281
          },
          {
            label: "South In",
            position: {
              x: 4.949999999999956,
              y: 0,
              z: 240
            },
            heading: -3.1389319963344087
          },
          {
            label: "South Out",
            position: {
              x: -4.950000000000045,
              y: 0,
              z: 240
            },
            heading: 3.138931996334409
          },
          {
            label: "East In",
            position: {
              x: 240,
              y: 0,
              z: -4.949999999999942
            },
            heading: 1.5734569840502814
          },
          {
            label: "East Out",
            position: {
              x: 240,
              y: 0,
              z: 4.950000000000059
            },
            heading: 1.5681356695395126
          }
        ]
      }
    },
    {
      id: "highway_entry",
      category: "ROAD",
      description: "One northbound carriageway and a ground entry with a long tangent merge",
      footprint: [
        125,
        870
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "mainElevation",
        "rampLaneCount",
        "rampRadius"
      ],
      ports: [
        "South Mainline In",
        "North Mainline Out",
        "South Local Entry"
      ],
      usage: "Stamp a simple elevated highway merge.",
      production: true,
      layout: "One northbound carriageway and a ground entry with a long tangent merge",
      specification: {
        laneWidths: [
          3.75,
          3.9
        ],
        pavedWidths: [
          13.75,
          6.4
        ],
        elevation: [
          0,
          8
        ],
        maximumGradePercent: 3.66,
        minimumCurveRadius: 600.7,
        ports: [
          {
            label: "South Mainline In",
            position: {
              x: 0,
              y: 8,
              z: 420
            },
            heading: 3.141592653589793
          },
          {
            label: "North Mainline Out",
            position: {
              x: 0,
              y: 8,
              z: -420
            },
            heading: 0
          },
          {
            label: "South Local Entry",
            position: {
              x: 100,
              y: 0,
              z: 420
            },
            heading: 3.139072104916664
          }
        ]
      }
    },
    {
      id: "highway_exit",
      category: "ROAD",
      description: "One northbound carriageway and a long tangent exit to ground",
      footprint: [
        125,
        870
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "mainElevation",
        "rampLaneCount",
        "rampRadius"
      ],
      ports: [
        "South Mainline In",
        "North Mainline Out",
        "North Local Exit"
      ],
      usage: "Stamp a simple elevated highway diverge.",
      production: true,
      layout: "One northbound carriageway and a long tangent exit to ground",
      specification: {
        laneWidths: [
          3.75,
          3.9
        ],
        pavedWidths: [
          13.75,
          6.4
        ],
        elevation: [
          0,
          8
        ],
        maximumGradePercent: 3.66,
        minimumCurveRadius: 600.7,
        ports: [
          {
            label: "South Mainline In",
            position: {
              x: 0,
              y: 8,
              z: 420
            },
            heading: 3.141592653589793
          },
          {
            label: "North Mainline Out",
            position: {
              x: 0,
              y: 8,
              z: -420
            },
            heading: 0
          },
          {
            label: "North Local Exit",
            position: {
              x: 100,
              y: 0,
              z: -420
            },
            heading: 0.0025205486731294607
          }
        ]
      }
    },
    {
      id: "residential_block",
      category: "DISTRICT",
      description: "Low/mid-rise housing, trees, lamps and a parking placeholder.",
      footprint: [
        140,
        110
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [],
      usage: "Fill an existing residential roadside block.",
      production: false
    },
    {
      id: "commercial_block",
      category: "DISTRICT",
      description: "Office, commercial boxes, parking, bus stop and trees.",
      footprint: [
        170,
        130
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [],
      usage: "Fill an existing commercial block.",
      production: false
    },
    {
      id: "industrial_block",
      category: "DISTRICT",
      description: "Factories, garage, parking and guardrails.",
      footprint: [
        180,
        130
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [],
      usage: "Fill an existing industrial block.",
      production: false
    },
    {
      id: "urban_boulevard_straight",
      category: "ROAD",
      description: "One two-way boulevard, 6 lanes by default",
      footprint: [
        30,
        600
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "mainElevation"
      ],
      ports: [
        "South",
        "North"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "One two-way boulevard, 6 lanes by default",
      specification: {
        laneWidths: [
          3.75
        ],
        pavedWidths: [
          22.5
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "South",
            position: {
              x: 0,
              y: 0,
              z: 300
            },
            heading: 3.141592653589793
          },
          {
            label: "North",
            position: {
              x: 0,
              y: 0,
              z: -300
            },
            heading: 0
          }
        ]
      }
    },
    {
      id: "urban_boulevard_curve",
      category: "ROAD",
      description: "One two-way boulevard, 300m centerline radius",
      footprint: [
        330,
        330
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "mainElevation"
      ],
      ports: [
        "South",
        "West"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "One two-way boulevard, 300m centerline radius",
      specification: {
        laneWidths: [
          3.75
        ],
        pavedWidths: [
          22.5
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: 300,
        ports: [
          {
            label: "South",
            position: {
              x: 0,
              y: 0,
              z: 0
            },
            heading: 3.1366217791379025
          },
          {
            label: "West",
            position: {
              x: -300,
              y: 0,
              z: -300
            },
            heading: -1.5658254523430057
          }
        ]
      }
    },
    {
      id: "elevated_expressway_straight",
      category: "ROAD",
      description: "Separate northbound/southbound carriageways, 3 lanes each by default",
      footprint: [
        38,
        600
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "mainElevation"
      ],
      ports: [
        "South In",
        "North Out",
        "North In",
        "South Out"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "Separate northbound/southbound carriageways, 3 lanes each by default",
      specification: {
        laneWidths: [
          3.75
        ],
        pavedWidths: [
          13.75
        ],
        elevation: [
          8,
          8
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "South In",
            position: {
              x: 8.125,
              y: 8,
              z: 300
            },
            heading: 3.141592653589793
          },
          {
            label: "North Out",
            position: {
              x: 8.125,
              y: 8,
              z: -300
            },
            heading: 0
          },
          {
            label: "North In",
            position: {
              x: -8.125,
              y: 8,
              z: -300
            },
            heading: 0
          },
          {
            label: "South Out",
            position: {
              x: -8.125,
              y: 8,
              z: 300
            },
            heading: 3.141592653589793
          }
        ]
      }
    },
    {
      id: "elevated_expressway_curve",
      category: "ROAD",
      description: "Separate concentric carriageways, approximately 300m radius",
      footprint: [
        340,
        340
      ],
      parameters: [
        "position",
        "rotation",
        "mainRoadLanes",
        "mainElevation"
      ],
      ports: [
        "South In",
        "West Out",
        "West In",
        "South Out"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "Separate concentric carriageways, approximately 300m radius",
      specification: {
        laneWidths: [
          3.75
        ],
        pavedWidths: [
          13.75
        ],
        elevation: [
          8,
          8
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: 291.9,
        ports: [
          {
            label: "South In",
            position: {
              x: 8.125,
              y: 8,
              z: 0
            },
            heading: 3.1367445167786925
          },
          {
            label: "West Out",
            position: {
              x: -300,
              y: 8,
              z: -308.125
            },
            heading: -1.5659481899837957
          },
          {
            label: "West In",
            position: {
              x: -300,
              y: 8,
              z: -291.875
            },
            heading: -1.5656630054654976
          },
          {
            label: "South Out",
            position: {
              x: -8.125,
              y: 8,
              z: 0
            },
            heading: 3.136459332260394
          }
        ]
      }
    },
    {
      id: "signal_cross_6x6",
      category: "INTERSECTION",
      description: "N/S 6 lanes, E/W 6 lanes, two-way",
      footprint: [
        470,
        470
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [
        "North",
        "East",
        "South",
        "West"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "N/S 6 lanes, E/W 6 lanes, two-way",
      specification: {
        laneWidths: [
          3.75
        ],
        pavedWidths: [
          22.5
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "North",
            position: {
              x: 0,
              y: 0,
              z: -220
            },
            heading: 0
          },
          {
            label: "East",
            position: {
              x: 220,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          },
          {
            label: "South",
            position: {
              x: 0,
              y: 0,
              z: 220
            },
            heading: 3.141592653589793
          },
          {
            label: "West",
            position: {
              x: -220,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          }
        ]
      }
    },
    {
      id: "signal_cross_6x4",
      category: "INTERSECTION",
      description: "N/S 6 lanes, E/W 4 lanes, two-way",
      footprint: [
        470,
        470
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [
        "North",
        "East",
        "South",
        "West"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "N/S 6 lanes, E/W 4 lanes, two-way",
      specification: {
        laneWidths: [
          3.75,
          3.6
        ],
        pavedWidths: [
          22.5,
          14.4
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "North",
            position: {
              x: 0,
              y: 0,
              z: -220
            },
            heading: 0
          },
          {
            label: "East",
            position: {
              x: 220,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          },
          {
            label: "South",
            position: {
              x: 0,
              y: 0,
              z: 220
            },
            heading: 3.141592653589793
          },
          {
            label: "West",
            position: {
              x: -220,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          }
        ]
      }
    },
    {
      id: "signal_cross_4x4",
      category: "INTERSECTION",
      description: "N/S 4 lanes, E/W 4 lanes, two-way",
      footprint: [
        470,
        470
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [
        "North",
        "East",
        "South",
        "West"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "N/S 4 lanes, E/W 4 lanes, two-way",
      specification: {
        laneWidths: [
          3.6
        ],
        pavedWidths: [
          14.4
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "North",
            position: {
              x: 0,
              y: 0,
              z: -220
            },
            heading: 0
          },
          {
            label: "East",
            position: {
              x: 220,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          },
          {
            label: "South",
            position: {
              x: 0,
              y: 0,
              z: 220
            },
            heading: 3.141592653589793
          },
          {
            label: "West",
            position: {
              x: -220,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          }
        ]
      }
    },
    {
      id: "t_4x2",
      category: "INTERSECTION",
      description: "E/W 4 lanes and north 2-lane stem, two-way",
      footprint: [
        470,
        250
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [
        "North",
        "East",
        "West"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "E/W 4 lanes and north 2-lane stem, two-way",
      specification: {
        laneWidths: [
          3.6
        ],
        pavedWidths: [
          7.2,
          14.4
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "North",
            position: {
              x: 0,
              y: 0,
              z: -220
            },
            heading: 0
          },
          {
            label: "East",
            position: {
              x: 220,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          },
          {
            label: "West",
            position: {
              x: -220,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          }
        ]
      }
    },
    {
      id: "t_4x4",
      category: "INTERSECTION",
      description: "E/W 4 lanes and north 4-lane stem, two-way",
      footprint: [
        470,
        250
      ],
      parameters: [
        "position",
        "rotation"
      ],
      ports: [
        "North",
        "East",
        "West"
      ],
      usage: "Production V1; use exposed endpoint poses to continue roads.",
      production: true,
      layout: "E/W 4 lanes and north 4-lane stem, two-way",
      specification: {
        laneWidths: [
          3.6
        ],
        pavedWidths: [
          14.4
        ],
        elevation: [
          0,
          0
        ],
        maximumGradePercent: 0,
        minimumCurveRadius: null,
        ports: [
          {
            label: "North",
            position: {
              x: 0,
              y: 0,
              z: -220
            },
            heading: 0
          },
          {
            label: "East",
            position: {
              x: 220,
              y: 0,
              z: 0
            },
            heading: 1.5707963267948966
          },
          {
            label: "West",
            position: {
              x: -220,
              y: 0,
              z: 0
            },
            heading: -1.5707963267948966
          }
        ]
      }
    }
  ]
};

// src/world/subject3/geometry.ts
var sampleRibbonPolyline = (points, maximumSpacing) => {
  const samples = [];
  const direction = (a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const incoming = direction(points[Math.max(0, i - 1)], point);
    const outgoing = direction(point, points[Math.min(points.length - 1, i + 1)]);
    const divisor = Math.max(0.25, 1 + incoming.x * outgoing.x + incoming.z * outgoing.z);
    const tangent = i === 0 ? outgoing : i === points.length - 1 ? incoming : { x: (incoming.x + outgoing.x) / divisor, z: (incoming.z + outgoing.z) / divisor };
    samples.push({ point, tangent });
    if (i === points.length - 1) continue;
    const next = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.z - point.z) / maximumSpacing));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      samples.push({
        point: {
          x: point.x + (next.x - point.x) * t,
          z: point.z + (next.z - point.z) * t,
          y: point.y === void 0 && next.y === void 0 ? void 0 : (point.y ?? 0) + ((next.y ?? 0) - (point.y ?? 0)) * t
        },
        tangent: outgoing
      });
    }
  }
  return samples;
};
var ARROW_OUTLINES = Object.freeze({
  "left-right": [
    [-0.18, 1.9],
    [-0.18, 0.65],
    [-0.62, 0.65],
    [-0.62, 0.95],
    [-1.35, 0.25],
    [-0.62, -0.45],
    [-0.62, -0.15],
    [0.62, -0.15],
    [0.62, -0.45],
    [1.35, 0.25],
    [0.62, 0.95],
    [0.62, 0.65],
    [0.18, 0.65],
    [0.18, 1.9]
  ],
  straight: [
    [-0.18, 1.9],
    [-0.18, -0.35],
    [-0.58, -0.35],
    [0, -1.7],
    [0.58, -0.35],
    [0.18, -0.35],
    [0.18, 1.9]
  ],
  left: [
    [-0.18, 1.9],
    [-0.18, 0.65],
    [-0.62, 0.65],
    [-0.62, 0.95],
    [-1.35, 0.25],
    [-0.62, -0.45],
    [-0.62, -0.15],
    [0.18, -0.15],
    [0.18, 1.9]
  ],
  right: [
    [0.18, 1.9],
    [0.18, 0.65],
    [0.62, 0.65],
    [0.62, 0.95],
    [1.35, 0.25],
    [0.62, -0.45],
    [0.62, -0.15],
    [-0.18, -0.15],
    [-0.18, 1.9]
  ],
  "straight-left": [
    [-0.18, 1.9],
    [-0.18, 0.35],
    [-0.62, 0.35],
    [-0.62, 0.6],
    [-1.4, 0.05],
    [-0.62, -0.5],
    [-0.62, -0.2],
    [-0.18, -0.2],
    [-0.18, -0.35],
    [-0.55, -0.35],
    [0, -1.6],
    [0.55, -0.35],
    [0.18, -0.35],
    [0.18, 1.9]
  ],
  "straight-right": [
    [0.18, 1.9],
    [0.18, 0.35],
    [0.62, 0.35],
    [0.62, 0.6],
    [1.4, 0.05],
    [0.62, -0.5],
    [0.62, -0.2],
    [0.18, -0.2],
    [0.18, -0.35],
    [0.55, -0.35],
    [0, -1.6],
    [-0.55, -0.35],
    [-0.18, -0.35],
    [-0.18, 1.9]
  ]
});

// src/world/city/RoadEdgeChain.ts
var RoadEdgeChains = class {
  corridors = [];
  frames = /* @__PURE__ */ new Map();
  starts = /* @__PURE__ */ new Map();
  neighbours = /* @__PURE__ */ new Map();
  roads;
  continuationIds = /* @__PURE__ */ new Map();
  constructor(map) {
    const roads = new Map(map.roads.map((r) => [r.id, r])), paths = new Map(map.roads.map((r) => [r.id, roadPoints(r)]));
    this.roads = roads;
    const key = (e) => e.roadId + ":" + e.end;
    const groups = [];
    for (const link of map.roadLinks ?? []) {
      const a = groups.find((g) => g.some((e) => key(e) === key(link.from))), b = groups.find((g) => g.some((e) => key(e) === key(link.to)));
      if (a && b && a !== b) {
        a.push(...b);
        groups.splice(groups.indexOf(b), 1);
      } else if (a && !b) a.push(link.to);
      else if (b && !a) b.push(link.from);
      else if (!a && !b) groups.push([link.from, link.to]);
    }
    const neighbour = /* @__PURE__ */ new Map();
    const out = (e) => {
      const p = paths.get(e.roadId), a = e.end === "start" ? p[0] : p.at(-1), b = e.end === "start" ? p[1] : p.at(-2), l = Math.hypot(b.x - a.x, b.z - a.z);
      return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    };
    for (const g of groups) for (const a of g) {
      const r = roads.get(a.roadId), p = paths.get(r.id)[a.end === "start" ? 0 : paths.get(r.id).length - 1], u = out(a);
      const matches = g.filter((b) => b.roadId !== r.id).filter((b) => {
        const s = roads.get(b.roadId), v = out(b), q = paths.get(s.id)[b.end === "start" ? 0 : paths.get(s.id).length - 1];
        return r.laneCount === s.laneCount && r.laneWidth === s.laneWidth && JSON.stringify(r.shoulders) === JSON.stringify(s.shoulders) && r.structure?.barrierEnabled === s.structure?.barrierEnabled && Math.hypot(p.x - q.x, p.z - q.z) < 0.06 && Math.abs((p.y ?? 0) - (q.y ?? 0)) < 0.02 && u.x * v.x + u.z * v.z < -0.95;
      });
      if (matches.length === 1) neighbour.set(key(a), matches[0]);
    }
    for (const [id, end] of neighbour) {
      const back = neighbour.get(key(end));
      if (!back || key(back) !== id) neighbour.delete(id);
    }
    for (const [id, end] of neighbour) this.neighbours.set(id, end);
    const seen = /* @__PURE__ */ new Set();
    for (const seed of map.roads) {
      if (seen.has(seed.id)) continue;
      let begin = { roadId: seed.id, end: "start" };
      const searched = /* @__PURE__ */ new Set();
      while (neighbour.has(key(begin)) && !searched.has(begin.roadId)) {
        searched.add(begin.roadId);
        const a = neighbour.get(key(begin));
        begin = { roadId: a.roadId, end: a.end === "start" ? "end" : "start" };
      }
      const parts = [], points = [];
      let current = begin, distance2 = 0;
      while (!seen.has(current.roadId)) {
        const r = roads.get(current.roadId), reverse = current.end === "end", p = reverse ? [...paths.get(r.id)].reverse() : paths.get(r.id);
        const start = points.length ? points.length - 1 : 0;
        points.push(...points.length ? p.slice(1) : p);
        parts.push({ r, reverse, start, end: points.length - 1 });
        this.starts.set(r.id, { distance: distance2, reverse });
        distance2 += polylineLength(p);
        seen.add(r.id);
        const next = neighbour.get(key({ roadId: r.id, end: reverse ? "start" : "end" }));
        if (!next) break;
        current = next;
      }
      const frames = sampleRibbonPolyline(points, Infinity);
      if (points.length > 3 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) < 0.06) {
        const p = points[0], a = points.at(-2), b = points[1], al = Math.hypot(p.x - a.x, p.z - a.z), bl = Math.hypot(b.x - p.x, b.z - p.z), u = { x: (p.x - a.x) / al, z: (p.z - a.z) / al }, v = { x: (b.x - p.x) / bl, z: (b.z - p.z) / bl }, divisor = Math.max(0.25, 1 + u.x * v.x + u.z * v.z), t = { x: (u.x + v.x) / divisor, z: (u.z + v.z) / divisor };
        frames[0].tangent = t;
        frames.at(-1).tangent = t;
      }
      for (const part of parts) {
        const f = frames.slice(part.start, part.end + 1);
        this.frames.set(part.r.id, part.reverse ? f.reverse().map((a) => ({ point: a.point, tangent: { x: -a.tangent.x, z: -a.tangent.z } })) : f);
      }
      this.corridors.push({ id: "edge:" + parts[0].r.id, roadIds: parts.map((p) => p.r.id), points, length: distance2 });
      const ids = new Set(parts.map((p) => p.r.id));
      for (const id of ids) this.continuationIds.set(id, ids);
    }
    for (const group of groups) for (const end of group) {
      const road = roads.get(end.roadId);
      if (!road.gore && !road.highwayTransition) continue;
      const own = this.frames.get(road.id), frame = own[end.end === "start" ? 0 : own.length - 1];
      const hosts = group.filter((e) => e.roadId !== road.id).map((e) => ({ end: e, road: roads.get(e.roadId) })).filter((q) => q.road.laneCount > road.laneCount || q.road.laneCount === road.laneCount && q.road.laneWidth > road.laneWidth + 0.01).sort((a, b) => b.road.laneCount * b.road.laneWidth - a.road.laneCount * a.road.laneWidth || a.road.id.localeCompare(b.road.id));
      const host = hosts[0];
      if (!host) continue;
      const frames = this.frames.get(host.road.id), other = frames[host.end.end === "start" ? 0 : frames.length - 1], sign = frame.tangent.x * other.tangent.x + frame.tangent.z * other.tangent.z >= 0 ? 1 : -1;
      if (Math.hypot(frame.point.x - other.point.x, frame.point.z - other.point.z) > 0.06 || Math.abs((frame.point.y ?? 0) - (other.point.y ?? 0)) > 0.02 || (frame.tangent.x * other.tangent.x + frame.tangent.z * other.tangent.z) * sign < 0.7) continue;
      frame.tangent = { x: other.tangent.x * sign, z: other.tangent.z * sign };
    }
  }
  continuations(roadId) {
    return this.continuationIds.get(roadId) ?? /* @__PURE__ */ new Set([roadId]);
  }
  edge(road, offset, yOffset = 0) {
    return (this.frames.get(road.id) ?? sampleRibbonPolyline(roadPoints(road), Infinity)).map((f) => ({ x: f.point.x - f.tangent.z * offset, y: (f.point.y ?? 0) + yOffset, z: f.point.z + f.tangent.x * offset }));
  }
  /** Structure offsets may differ at a tunnel portal. Blend both sections to a
   * common wall/rail endpoint while keeping the drivable pavement edge fixed. */
  barrierEdge(road, side) {
    const frames = this.frames.get(road.id), own = road.structure?.barrierOffset ?? 0, edges = roadEdges(road), length = polylineLength(frames.map((f) => f.point));
    const joined = (end2) => {
      const e = this.neighbours.get(road.id + ":" + end2);
      return e ? (own + (this.roads.get(e.roadId).structure?.barrierOffset ?? 0)) / 2 : own;
    };
    const start = joined("start"), end = joined("end");
    let d = 0;
    return frames.map((f, i) => {
      if (i) d += Math.hypot(f.point.x - frames[i - 1].point.x, f.point.z - frames[i - 1].point.z);
      const span = Math.min(30, length / 2), extra = own + (start - own) * Math.max(0, 1 - d / span) + (end - own) * Math.max(0, 1 - (length - d) / span), offset = (side < 0 ? edges.left : edges.right) + side * extra;
      return { x: f.point.x - f.tangent.z * offset, y: f.point.y ?? 0, z: f.point.z + f.tangent.x * offset };
    });
  }
  /** Sampling phase shared across continued road IDs, avoiding paired lamps at seams. */
  firstStation(road, spacing, phase = spacing / 2) {
    const start = this.starts.get(road.id);
    if (!start) return phase;
    const d = ((phase - start.distance) % spacing + spacing) % spacing;
    return start.reverse ? ((start.distance + polylineLength(roadPoints(road)) - phase) % spacing + spacing) % spacing : d;
  }
};
var cache = /* @__PURE__ */ new WeakMap();
function roadEdgeChains(map) {
  let c = cache.get(map);
  if (!c) {
    c = new RoadEdgeChains(map);
    cache.set(map, c);
  }
  return c;
}

// src/world/city/JunctionSurface.ts
function junctionApproachExtent(j, map, port) {
  const offset = j.approachOffsets?.[port];
  if (offset) {
    const d2 = portDirection(j, port);
    return offset.x * d2.x + offset.z * d2.z;
  }
  if (!j.pavementFootprint) return junctionExtent(j, map);
  const d = portDirection(j, port);
  let distance2 = 0;
  const polygon = j.pavementFootprint;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], ex = b.x - a.x, ez = b.z - a.z, den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-8) continue;
    const t = (a.x * ez - a.z * ex) / den, u = (a.x * d.z - a.z * d.x) / den;
    if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6) distance2 = Math.max(distance2, t);
  }
  return distance2 || junctionExtent(j, map);
}
function junctionSurfaceContains(j, map, p, margin = 0) {
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation), outline = j.pavementFootprint;
  if (!outline) {
    const h = junctionExtent(j, map) + margin;
    return Math.abs(q.x) <= h && Math.abs(q.z) <= h;
  }
  let inside = false;
  for (let i = 0, k2 = outline.length - 1; i < outline.length; k2 = i++) {
    const a = outline[i], b = outline[k2];
    if (a.z > q.z !== b.z > q.z && q.x < (b.x - a.x) * (q.z - a.z) / (b.z - a.z) + a.x)
      inside = !inside;
    const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l)) : 0;
    const distance2 = Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz);
    if (margin < 0 && distance2 <= -margin) return false;
    if (distance2 <= margin + 1e-6)
      return true;
  }
  return inside;
}
function setJunctionPavementFootprint(j, map) {
  const points = [{ x: 0, y: 0, z: 0 }];
  const ribbons = [];
  const approaches = [];
  for (const c of j.connections) {
    const r = map.roads.find((r2) => r2.id === c.roadId);
    if (!r) continue;
    const path = roadPoints(r), start = c.end === "start", mouth = start ? path[0] : path.at(-1);
    const neighbour = start ? path[1] : path.at(-2);
    const dx = start ? neighbour.x - mouth.x : mouth.x - neighbour.x;
    const dz = start ? neighbour.z - mouth.z : mouth.z - neighbour.z;
    const length = Math.hypot(dx, dz) || 1, e = roadEdges(r);
    for (const offset of [e.left, e.right])
      points.push(rotatePoint({
        x: mouth.x - j.position.x - dz / length * offset,
        y: (mouth.y ?? 0) - (j.position.y ?? 0),
        z: mouth.z - j.position.z + dx / length * offset
      }, -j.rotation));
    const outward = start ? path : [...path].reverse(), total = polylineLength(outward);
    const otherJunction = map.intersections.some((other) => other !== j && other.connections.some((q) => q.roadId === r.id));
    const reach = Math.min(180, otherJunction ? total / 2 : total), near = [];
    let distance2 = 0;
    for (let i = 0; i < outward.length; i++) {
      if (i) distance2 += Math.hypot(outward[i].x - outward[i - 1].x, outward[i].z - outward[i - 1].z);
      if (distance2 >= reach) {
        near.push(sampleAt(outward, reach).point);
        break;
      }
      near.push(outward[i]);
    }
    const samples = sampleRibbonPolyline(near, 6), left = start ? e.left : -e.right, right = start ? e.right : -e.left;
    approaches.push({ path: outward, reach, left, right, distance: 0 });
    const edge = (i, offset) => {
      const s = samples[i];
      return { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset };
    };
    ribbons.push(samples.slice(1).map((_, i) => [edge(i, left), edge(i, right), edge(i + 1, right), edge(i + 1, left)]));
  }
  if (points.length < 3) return;
  for (let i = 0; i < ribbons.length; i++) for (let k2 = i + 1; k2 < ribbons.length; k2++) for (const a2 of ribbons[i]) for (const b2 of ribbons[k2]) {
    if (Math.max(...a2.map((p) => p.x)) < Math.min(...b2.map((p) => p.x)) || Math.min(...a2.map((p) => p.x)) > Math.max(...b2.map((p) => p.x)) || Math.max(...a2.map((p) => p.z)) < Math.min(...b2.map((p) => p.z)) || Math.min(...a2.map((p) => p.z)) > Math.max(...b2.map((p) => p.z))) continue;
    if (Math.abs(a2.reduce((s, p) => s + (p.y ?? 0), 0) - b2.reduce((s, p) => s + (p.y ?? 0), 0)) > 2) continue;
    let overlap = a2;
    for (let e = 0; e < b2.length && overlap.length; e++) {
      const p = b2[e], q = b2[(e + 1) % b2.length], side = (r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x), cut = [];
      for (let n = 0; n < overlap.length; n++) {
        const x = overlap[n], y = overlap[(n + 1) % overlap.length], sx = side(x), sy = side(y), inside = sx <= 0;
        if (inside) cut.push(x);
        if (inside !== sy <= 0) {
          const t = sx / (sx - sy);
          cut.push({ x: x.x + t * (y.x - x.x), y: (x.y ?? 0) + t * ((y.y ?? 0) - (x.y ?? 0)), z: x.z + t * (y.z - x.z) });
        }
      }
      overlap = cut;
    }
    const area = overlap.reduce((sum, p, n) => {
      const q = overlap[(n + 1) % overlap.length];
      return sum + p.x * q.z - q.x * p.z;
    }, 0);
    if (overlap.length >= 3 && Math.abs(area) > 1e-4) for (const p of overlap) {
      points.push(rotatePoint({ x: p.x - j.position.x, y: (p.y ?? 0) - (j.position.y ?? 0), z: p.z - j.position.z }, -j.rotation));
      for (const index of [i, k2]) {
        const approach = approaches[index], mouth = approach.path[0], tangent = sampleAt(approach.path, 0).tangent;
        approach.distance = Math.max(approach.distance, (p.x - mouth.x) * tangent.x + (p.z - mouth.z) * tangent.z);
      }
    }
  }
  for (const approach of approaches) if (approach.distance > 0.1) {
    const s = sampleAt(approach.path, Math.min(approach.reach, approach.distance + 7));
    for (const offset of [approach.left, approach.right]) points.push(rotatePoint({ x: s.point.x - j.position.x - s.tangent.z * offset, y: (s.point.y ?? 0) - (j.position.y ?? 0), z: s.point.z - j.position.z + s.tangent.x * offset }, -j.rotation));
  }
  points.sort((a2, b2) => a2.x - b2.x || a2.z - b2.z);
  const cross = (a2, b2, c) => (b2.x - a2.x) * (c.z - a2.z) - (b2.z - a2.z) * (c.x - a2.x);
  const hull = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0)
        out.pop();
      out.push(p);
    }
    return out;
  };
  const a = hull(points), b = hull([...points].reverse());
  j.pavementFootprint = [...a.slice(0, -1), ...b.slice(0, -1)];
  if (map.environment.metadata?.groundElevationVersion === "1" && j.connections.every((c) => Math.abs((j.pavementHeights?.[c.port] ?? Infinity) - (j.position.y ?? 0)) < 1e-7))
    for (const p of j.pavementFootprint) p.y = 0;
  j.markingFootprint = { kind: "polygon", points: structuredClone(j.pavementFootprint) };
}
function junctionSurfaceHeight(j, p) {
  const outline = j.pavementFootprint, base = j.position.y ?? 0;
  if (!outline)
    return base;
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], den = a.x * b.z - a.z * b.x;
    if (Math.abs(den) < 1e-8)
      continue;
    const u = (q.x * b.z - q.z * b.x) / den, v = (a.x * q.z - a.z * q.x) / den;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
      return base + u * (a.y ?? 0) + v * (b.y ?? 0);
  }
  return base;
}

// src/world/city/RoadClearance.ts
var runtimeCache = /* @__PURE__ */ new WeakMap();
function invalidateRoadClearance(map) {
  runtimeCache.delete(map);
}
function runtimeRoadClearance(map) {
  let index = runtimeCache.get(map);
  if (!index) {
    index = new RoadClearance(map);
    runtimeCache.set(map, index);
  }
  return index;
}
var RoadClearance = class {
  constructor(map) {
    this.map = map;
    if (map.regional) for (const junction of map.intersections) {
      const radius = (junction.pavementFootprint ? Math.max(...junction.pavementFootprint.map((p) => Math.hypot(p.x, p.z))) : Math.SQRT2 * junctionExtent(junction, map)) + 1e-5;
      for (let x = Math.floor((junction.position.x - radius) / 50); x <= Math.floor((junction.position.x + radius) / 50); x++) for (let z = Math.floor((junction.position.z - radius) / 50); z <= Math.floor((junction.position.z + radius) / 50); z++) {
        const key = x + "," + z, list = this.junctionBuckets.get(key) ?? [];
        list.push(junction);
        this.junctionBuckets.set(key, list);
      }
    }
    for (const road of map.roads) {
      const points = roadPoints(road), edges = roadEdges(road), margin = Math.max(-edges.left, edges.right) + 6;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], segment = { roadId: road.id, a, b, ...edges, laneHalf: road.laneCount * road.laneWidth / 2 };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 50); x <= Math.floor((Math.max(a.x, b.x) + margin) / 50); x++)
          for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 50); z <= Math.floor((Math.max(a.z, b.z) + margin) / 50); z++) {
            const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
            bucket.push(segment);
            this.buckets.set(key, bucket);
          }
      }
    }
  }
  map;
  buckets = /* @__PURE__ */ new Map();
  junctionBuckets = /* @__PURE__ */ new Map();
  roadAt(p, margin = 0, minY = -Infinity, maxY = Infinity, exclude, match, carriagewayOnly = false) {
    for (let bx = Math.floor((p.x - margin) / 50); bx <= Math.floor((p.x + margin) / 50); bx++) for (let bz = Math.floor((p.z - margin) / 50); bz <= Math.floor((p.z + margin) / 50); bz++) for (const s of this.buckets.get(`${bx},${bz}`) ?? []) {
      if (s.roadId === exclude || match && !match(s.roadId)) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / length;
      if (along < -margin || along > length + margin) continue;
      const t = Math.max(0, Math.min(1, along / length));
      const y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t;
      const offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / length;
      if (y >= minY && y <= maxY && offset >= (carriagewayOnly ? -s.laneHalf : s.left) - margin && offset <= (carriagewayOnly ? s.laneHalf : s.right) + margin) return true;
    }
    return false;
  }
  /** Lowest overlying support plane, used to terminate retaining walls below decks. */
  lowestDeckHeight(p, minY, maxY, exclude, margin = 3) {
    let result = Infinity;
    for (const s of this.buckets.get(`${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`) ?? []) {
      if (s.roadId === exclude) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz);
      if (l < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / l;
      if (along < -margin || along > l + margin) continue;
      const t = Math.max(0, Math.min(1, along / l)), y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t, offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / l;
      if (y >= minY && y <= maxY && offset >= s.left - margin && offset <= s.right + margin) result = Math.min(result, y);
    }
    return Number.isFinite(result) ? result : void 0;
  }
  junctionAt(p, margin = 0, minY = -Infinity, maxY = Infinity) {
    const candidates = this.map.regional ? /* @__PURE__ */ new Set() : void 0;
    if (candidates) {
      const pad = Math.max(0, margin);
      for (let x = Math.floor((p.x - pad) / 50); x <= Math.floor((p.x + pad) / 50); x++) for (let z = Math.floor((p.z - pad) / 50); z <= Math.floor((p.z + pad) / 50); z++) for (const j of this.junctionBuckets.get(x + "," + z) ?? []) candidates.add(j);
    }
    for (const j of candidates ?? this.map.intersections) {
      const y = junctionSurfaceHeight(j, p);
      if (y < minY || y > maxY) continue;
      if (junctionSurfaceContains(j, this.map, p, margin)) return true;
    }
    return false;
  }
  /** Includes shoulders, junction crossings and signal sight space. */
  permitsProp(p, radius = 1, height = 2) {
    const y = p.y ?? 0;
    return !this.roadAt(p, radius, y - 2, y + height + 0.65) && !this.junctionAt(p, radius + 8, y - 2, y + height + 0.65);
  }
};

// src/world/subject3/trafficSignals.ts
var armControlKind = (outward) => Math.abs(outward.x) >= Math.abs(outward.z) ? "east-west" : "north-south";

// src/world/city/RoadClassification.ts
function roadFunction(road) {
  switch (road.roadClass) {
    case "avenue":
      return "arterial";
    case "alley":
      return "local";
    case "industrial":
      return "collector";
    case void 0:
      if (road.styleId === "urban_auxiliary_2") return "frontage";
      if (road.styleId === "collector_distributor_2") return "connector";
      if (road.type === "highway" && road.styleId === "urban_local_2" && road.speedLimit <= 30) return "collector";
      if (road.type === "ramp_1" || road.gore && road.laneCount <= 2) return "ramp";
      if (road.type === "highway" || road.styleId === "urban_expressway_6") return "expressway";
      return road.type === "urban_6lane" ? "arterial" : road.type === "urban_4lane" ? "collector" : "local";
    default:
      return road.roadClass;
  }
}
function isControlledAccessRoad(road) {
  const kind = roadFunction(road);
  return kind === "expressway" || kind === "ramp" || kind === "connector";
}

// src/world/city/CityRoadNetwork.ts
function buildCityRoadNetwork(map) {
  const roads = new Map(map.roads.map((r) => [r.id, r]));
  const junctionByEndpoint = /* @__PURE__ */ new Map();
  for (const j of map.intersections) for (const c of j.connections) junctionByEndpoint.set(`${c.roadId}:${c.end}`, j.id);
  const segments = map.roads.map((r) => {
    const centerline = roadPoints(r);
    const endpoint2 = (end) => junctionByEndpoint.get(`${r.id}:${end}`);
    const name = r.roadNameId ? map.roadNames?.[r.roadNameId] : void 0;
    const kind = roadFunction(r), ramp = kind === "ramp";
    return {
      id: r.id,
      name: r.displayName ?? (ramp ? void 0 : name?.primaryText),
      routeNumber: ramp || r.displayName === "" ? void 0 : name?.routeNumber,
      nameId: r.roadNameId,
      centerline,
      width: r.laneCount * r.laneWidth,
      length: polylineLength(centerline),
      laneCountPerDirection: r.travelDirection === "two-way" ? r.laneCount / 2 : r.laneCount,
      laneWidth: r.laneWidth,
      laneCount: r.laneCount,
      travelDirection: r.travelDirection,
      speedLimit: r.speedLimit,
      roadFunction: kind,
      roadType: ramp ? "ramp" : kind === "expressway" || kind === "connector" ? "highway" : "urban",
      markingsAvailable: r.markings !== false,
      highwayTransition: r.highwayTransition,
      startIntersectionId: endpoint2("start"),
      endIntersectionId: endpoint2("end"),
      lanes: Array.from({ length: r.laneCount }, (_, index) => ({
        id: `${r.id}:lane:${index}`,
        roadId: r.id,
        index,
        direction: r.travelDirection === "two-way" ? index < r.laneCount / 2 ? "reverse" : "forward" : r.travelDirection,
        width: r.laneWidth
      }))
    };
  });
  const segmentById = new Map(segments.map((r) => [r.id, r]));
  const connectivity = map.intersections.map((j) => {
    const incomingRoadIds = [], outgoingRoadIds = [];
    for (const c of j.connections) {
      const r = roads.get(c.roadId);
      if (r.travelDirection === "two-way" || r.travelDirection === "forward" === (c.end === "end")) incomingRoadIds.push(r.id);
      if (r.travelDirection === "two-way" || r.travelDirection === "forward" === (c.end === "start")) outgoingRoadIds.push(r.id);
    }
    return { intersectionId: j.id, incomingRoadIds, outgoingRoadIds };
  });
  const endpointNodes = [];
  const nodeByEndpoint = /* @__PURE__ */ new Map();
  for (const road of segments) for (const end of ["start", "end"]) {
    if ((end === "start" ? road.startIntersectionId : road.endIntersectionId) !== void 0) continue;
    const position = end === "start" ? road.centerline[0] : road.centerline.at(-1);
    const node = { id: `endpoint:${road.id}:${end}`, position, ends: [{ roadId: road.id, end }] };
    endpointNodes.push(node);
    nodeByEndpoint.set(`${road.id}:${end}`, node);
  }
  for (const link of map.roadLinks ?? []) {
    const a = nodeByEndpoint.get(`${link.from.roadId}:${link.from.end}`);
    const b = nodeByEndpoint.get(`${link.to.roadId}:${link.to.end}`);
    if (a && b && a !== b) {
      a.ends.push(...b.ends);
      for (const end of b.ends) nodeByEndpoint.set(`${end.roadId}:${end.end}`, a);
      b.ends = [];
    }
  }
  const joinedNodes = endpointNodes.filter((n) => n.ends.length > 0);
  const laneConnections = [];
  const routingConnections = [];
  for (const node of joinedNodes.filter((n) => n.ends.length > 1)) {
    const incomingRoadIds = [], outgoingRoadIds = [];
    for (const end of node.ends) {
      const road = segmentById.get(end.roadId);
      if (road.lanes.some((l) => l.direction === "forward" === (end.end === "end"))) incomingRoadIds.push(road.id);
      if (road.lanes.some((l) => l.direction === "forward" === (end.end === "start"))) outgoingRoadIds.push(road.id);
    }
    connectivity.push({ intersectionId: node.id, incomingRoadIds, outgoingRoadIds });
    for (const fromId of incomingRoadIds) for (const toId of outgoingRoadIds) if (fromId !== toId) {
      const from = segmentById.get(fromId), to = segmentById.get(toId);
      const fromEnd = node.ends.find((e) => e.roadId === fromId), toEnd = node.ends.find((e) => e.roadId === toId);
      routingConnections.push({ fromRoadId: fromId, fromEnd: fromEnd.end, toRoadId: toId, toEnd: toEnd.end });
      for (const fromLane of from.lanes) for (const toLane of to.lanes) if (fromLane.direction === "forward" === (fromEnd.end === "end") && toLane.direction === "forward" === (toEnd.end === "start")) laneConnections.push({ intersectionId: node.id, fromLaneId: fromLane.id, toLaneId: toLane.id });
    }
  }
  for (const j of map.intersections) for (const incoming of j.connections) for (const outgoing of j.connections) {
    if (incoming.roadId === outgoing.roadId) continue;
    const from = segmentById.get(incoming.roadId), to = segmentById.get(outgoing.roadId);
    const movement = turnMovement(from.centerline, incoming.end, to.centerline, outgoing.end);
    const approaches = j.approaches?.[incoming.port]?.lanes;
    if (!approaches || approaches.some((lane) => lane.split("-").includes(movement))) {
      routingConnections.push({ fromRoadId: from.id, fromEnd: incoming.end, toRoadId: to.id, toEnd: outgoing.end, via: j.position });
    }
    for (const fromLane of from.lanes) {
      if (fromLane.direction === "forward" !== (incoming.end === "end")) continue;
      for (const toLane of to.lanes) if (toLane.direction === "forward" === (outgoing.end === "start")) {
        laneConnections.push({ intersectionId: j.id, fromLaneId: fromLane.id, toLaneId: toLane.id });
      }
    }
  }
  return {
    mapId: map.id,
    bounds: { minimumX: map.bounds.minX, maximumX: map.bounds.maxX, minimumZ: map.bounds.minZ, maximumZ: map.bounds.maxZ },
    segments,
    connectivity,
    endpointNodes: joinedNodes,
    laneConnections,
    routing: { connections: routingConnections, places: [
      ...(map.regional?.highways?.services ?? []).map((place) => ({ id: place.id, name: place.name, position: place.position, roadIds: place.roadIds, kind: "service" })),
      ...(map.environment.landmarks ?? []).map((place) => ({ ...place, kind: "landmark" })),
      ...(map.regional?.highways?.junctions ?? []).filter((j) => j.kind === "interchange").map((place) => ({ id: place.id, name: place.name, position: place.position, roadIds: place.roadIds, kind: "interchange" }))
    ] },
    intersections: map.intersections.map((j) => {
      const h = junctionExtent(j, map), box = h * (Math.abs(Math.cos(j.rotation)) + Math.abs(Math.sin(j.rotation)));
      const pavementFootprint = j.pavementFootprint?.map((p) => {
        const q = rotatePoint(p, j.rotation);
        return { x: j.position.x + q.x, z: j.position.z + q.z };
      });
      return { id: j.id, center: j.position, halfExtentX: pavementFootprint ? Math.max(...pavementFootprint.map((p) => Math.abs(p.x - j.position.x))) : box, halfExtentZ: pavementFootprint ? Math.max(...pavementFootprint.map((p) => Math.abs(p.z - j.position.z))) : box, pavementFootprint, arms: j.connections.map((c) => {
        const r = roads.get(c.roadId), outward = rotatePoint(portDirection(j, c.port), j.rotation);
        return {
          segmentId: r.id,
          outward,
          approachYawRadians: Math.atan2(outward.x, outward.z),
          approachLaneCount: r.travelDirection === "two-way" ? r.laneCount / 2 : r.laneCount,
          trafficSignal: j.signalized ? { junctionId: j.id, controlKind: armControlKind(portDirection(j, c.port)) } : void 0
        };
      }) };
    })
  };
}
function turnMovement(from, fromEnd, to, toEnd) {
  const a = fromEnd === "end" ? from.at(-2) : from[1], b = fromEnd === "end" ? from.at(-1) : from[0];
  const c = toEnd === "start" ? to[0] : to.at(-1), d = toEnd === "start" ? to[1] : to.at(-2);
  const angle = Math.atan2((b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x), (b.x - a.x) * (d.x - c.x) + (b.z - a.z) * (d.z - c.z));
  return Math.abs(angle) < Math.PI / 5 ? "straight" : angle > 0 ? "right" : "left";
}

// src/world/city/CityTerrain.ts
function cityTerrainOffsetAt(forms, x, z) {
  let y = 0;
  for (const f of forms ?? []) {
    const dx = (x - f.center.x) / f.radiusX, dz = (z - f.center.z) / f.radiusZ, q = dx * dx + dz * dz;
    if (q < 1) y += f.height * (1 - q) ** 2;
  }
  return y;
}

// src/world/regional/RegionalTerrain.ts
var samplerCache = /* @__PURE__ */ new WeakMap();
function regionalTerrainSampler(map) {
  let sampler = samplerCache.get(map);
  if (!sampler) {
    sampler = new RegionalTerrainSampler(map);
    samplerCache.set(map, sampler);
  }
  return sampler;
}
var blend = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};
var RegionalTerrainSampler = class {
  constructor(map) {
    this.map = map;
    this.cityAreas = [map.regional.cityBounds, ...map.regional.cityExtensions ?? []];
    this.westCrossings = map.regional.structures.filter((s) => s.kind === "bridge" && s.routes.includes("S37")).map((s) => s.center).sort((a, b) => a.z - b.z);
    for (const road of map.roads) {
      if (!road.id.startsWith("regional:")) continue;
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1], b = road.centerline[i], s = { a, b, halfWidth: road.laneCount * road.laneWidth / 2 + 4, tunnel: road.corridorSection === "TUNNEL", bridge: road.corridorSection === "BRIDGE", ramp: road.corridorSection === "RAMP" };
        for (let x = Math.floor((Math.min(a.x, b.x) - 90) / 100); x <= Math.floor((Math.max(a.x, b.x) + 90) / 100); x++) for (let z = Math.floor((Math.min(a.z, b.z) - 90) / 100); z <= Math.floor((Math.max(a.z, b.z) + 90) / 100); z++) {
          const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
          bucket.push(s);
          this.buckets.set(key, bucket);
        }
      }
    }
  }
  map;
  cityAreas;
  buckets = /* @__PURE__ */ new Map();
  westCrossings;
  waterAt(x, z) {
    const east = 6250 + z * 0.08 + 80 * Math.sin(z / 1300);
    const a = this.westCrossings[0], b = this.westCrossings[1], t = a && b ? (z - a.z) / (b.z - a.z) : 0;
    const west = a && b ? a.x + (b.x - a.x) * t + 220 * Math.sin(t * Math.PI * 2) : -3450 - 500 * Math.sin(z / 850);
    return x > 4e3 && Math.abs(x - east) < 260 || x < -2600 && Math.abs(x - west) < 42 || x > 6800 && Math.abs((z + 50) % 900) < 12;
  }
  macroHeight(x, z) {
    if (this.cityAreas.some((city) => x >= city.minX && x <= city.maxX && z >= city.minZ && z <= city.maxZ)) return -0.04 + cityTerrainOffsetAt(this.map.environment.landforms, x, z);
    const north = blend((-z - 2100) / 2200);
    const ridge = 55 * Math.exp(-(((z + 3250) / 380) ** 2)) + 65 * Math.exp(-(((z + 5050) / 540) ** 2));
    const valley = 12 + 10 * Math.sin(x / 1600) ** 2;
    let height = north * (ridge + valley) + blend((-x - 2500) / 1600) * 10 * (0.6 + 0.4 * Math.sin(z / 780));
    if (this.map.regional?.highways && x > 4500 && z < -5300) height += 55 * Math.exp(-(((x - 5350) / 1500) ** 2) - ((z + 6500) / 650) ** 2);
    if (this.waterAt(x, z)) height = -7;
    return height - 0.04;
  }
  projection(x, z, s) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / (dx * dx + dz * dz)));
    return { distance: Math.hypot(x - s.a.x - dx * t, z - s.a.z - dz * t), height: (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t };
  }
  nearRoad(x, z, margin) {
    return (this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []).some((s) => this.projection(x, z, s).distance < s.halfWidth + margin);
  }
  heightAt(x, z) {
    let result = this.macroHeight(x, z), best = Infinity, selected, height = 0;
    for (const s of this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []) {
      const q = this.projection(x, z, s), distance2 = q.distance - s.halfWidth;
      if (distance2 < best) {
        best = distance2;
        selected = s;
        height = q.height;
      }
    }
    if (selected && best < 65) {
      if (selected.tunnel) return Math.max(result, height + 10);
      if (selected.ramp) result = Math.min(result, height - 0.65) * (1 - blend((best - 25) / 40)) + result * blend((best - 25) / 40);
      else if (selected.bridge) result = Math.min(result, height - 12) * (1 - blend(best / 65)) + result * blend(best / 65);
      else {
        const u = blend((best - 25) / 65);
        result = (height - 0.04) * (1 - u) + result * u;
      }
    }
    for (const s of this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []) {
      if (s.tunnel) continue;
      const q = this.projection(x, z, s), d = q.distance - s.halfWidth;
      if (d < 65) {
        const u = blend((d - 25) / 40), cap = q.height - (s.ramp || s.bridge ? 0.65 : 0.04);
        result = Math.min(result, cap * (1 - u) + result * u);
      }
    }
    return result;
  }
};

// src/world/city/RoadInfrastructure.ts
function roadPiers(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (road.structure?.piersEnabled === false) return [];
  const points = roadPoints(road), length = polylineLength(points), spacing = road.structure?.pierSpacing ?? 30, piers = [];
  for (let d = spacing / 2; d < length - 8; d += spacing) {
    const { point: p } = sampleAt(points, d), baseY = map?.regional && road.id.startsWith("regional:") ? regionalTerrainSampler(map).heightAt(p.x, p.z) : 0, height = (p.y ?? 0) - 0.65 - baseY;
    if (height < 2) continue;
    if (clearance?.junctionAt(p, 10, baseY, (p.y ?? 0) - 0.65) || clearance?.roadAt(p, 2, baseY, (p.y ?? 0) - 0.65, road.id)) continue;
    piers.push({ position: p, height, baseY });
  }
  return piers;
}

// src/world/city/presets/PresetGeometryValidation.ts
function validatePresetGeometry(map, targets) {
  const issues = [], clearance = new RoadClearance(map);
  const error = (code, path, message) => issues.push({ severity: "error", code, path, message });
  const branchNodes = buildCityRoadNetwork(map).endpointNodes.filter((n) => n.ends.length > 1);
  const chains = roadEdgeChains(map);
  const auxiliary = map.roads.filter((r) => r.highwayTransition).map((r) => ({ road: r, members: /* @__PURE__ */ new Set([r.id, r.highwayTransition.decisionId, ...chains.continuations(r.highwayTransition.mainRoadId)]) }));
  const corridorForRoad = new Map(chains.corridors.flatMap((c) => c.roadIds.map((id) => [id, c.id])));
  const auxiliaryByRoad = /* @__PURE__ */ new Map();
  for (const lane of auxiliary) for (const id of lane.members) {
    const list = auxiliaryByRoad.get(id) ?? [];
    list.push(lane);
    auxiliaryByRoad.set(id, list);
  }
  const branchCells = /* @__PURE__ */ new Map();
  for (const node of branchNodes) {
    const key = Math.floor(node.position.x / 256) + "," + Math.floor(node.position.z / 256), list = branchCells.get(key) ?? [];
    list.push({ node, corridors: new Set(node.ends.map((e) => corridorForRoad.get(e.roadId))) });
    branchCells.set(key, list);
  }
  const sharedBranch = (a, b, p, radius) => {
    if ((auxiliaryByRoad.get(a) ?? []).some((l) => l.members.has(b) && l.road.centerline.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < radius + 12))) return true;
    const ac = corridorForRoad.get(a), bc = corridorForRoad.get(b);
    for (let x = Math.floor((p.x - radius) / 256); x <= Math.floor((p.x + radius) / 256); x++) for (let z = Math.floor((p.z - radius) / 256); z <= Math.floor((p.z + radius) / 256); z++)
      if ((branchCells.get(x + "," + z) ?? []).some(({ node, corridors }) => corridors.has(ac) && corridors.has(bc) && Math.hypot(p.x - node.position.x, p.z - node.position.z) < radius)) return true;
    return false;
  };
  const radii = /* @__PURE__ */ new Map();
  const corridorRadius = (id) => {
    const corridor = chains.corridors.find((c) => c.roadIds.includes(id)), cached = radii.get(corridor.id);
    if (cached !== void 0) return cached;
    const points = corridor.points.filter((b, i, p) => {
      if (!i || i === p.length - 1) return true;
      const a = p[i - 1], c = p[i + 1];
      return Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > 1e-6;
    });
    let radius = Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1], cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
      if (cross > 1e-6) radius = Math.min(radius, Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z) * Math.hypot(c.x - a.x, c.z - a.z) / (2 * cross));
    }
    radii.set(corridor.id, radius);
    return radius;
  };
  const paths = map.roads.map((r) => {
    const points = roadPoints(r);
    return { road: r, points, bounds: { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minZ: Math.min(...points.map((p) => p.z)), maxZ: Math.max(...points.map((p) => p.z)) } };
  });
  for (const { road: r, points } of paths) {
    if (targets && !targets.has(r.id)) continue;
    const ramp = roadFunction(r) === "ramp", regionalRamp = r.id.startsWith("regional:") && ramp;
    const path = `roads.${r.id}`, edges = roadEdges(r);
    if (r.laneWidth < 3.5) error("geometry.width", path, "Production lanes must be at least 3.5m.");
    if (ramp && !r.highwayTransition && (r.laneWidth < (regionalRamp ? 3.5 : 3.8) || edges.width < r.laneCount * r.laneWidth + 2.2)) error("geometry.rampWidth", path, "Ramp needs traffic lanes and at least 2.2m of paved shoulders.");
    let grade = 0, radius = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      grade = Math.max(grade, Math.abs((b.y ?? 0) - (a.y ?? 0)) / length);
      if (length < 0.05) error("geometry.short", path, "Degenerate sampled segment.");
      if (i + 1 < points.length) {
        const c = points[i + 1], l2 = Math.hypot(c.x - b.x, c.z - b.z), chord = Math.hypot(c.x - a.x, c.z - a.z);
        const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
        if (cross > 1e-6) radius = Math.min(radius, length * l2 * chord / (2 * cross));
      }
    }
    if (grade > (ramp ? 0.08 : 0.06) + 1e-5) error("geometry.grade", path, `Sampled grade ${(grade * 100).toFixed(2)}% exceeds production limit.`);
    const loop = r.id.endsWith("-loop");
    if (r.id.startsWith("regional:") && !r.gore) radius = corridorRadius(r.id);
    if (radius < (loop ? r.designProfile === "urban" ? 29.9 : 44.9 : ramp && r.speedLimit <= 25 ? 12 : r.designProfile === "urban" ? 30 : ramp || r.presetSource?.startsWith("system_") ? 55 : 100)) error("geometry.curve", path, `Minimum sampled radius ${radius.toFixed(1)}m is too small.`);
    for (let d = 6; d < polylineLength(points) - 6; d += 6) {
      const p = sampleAt(points, d).point, y = p.y ?? 0;
      if (clearance.roadAt(p, 0, y + 0.25, y + 4.5, r.id, (other) => !sharedBranch(r.id, other, p, 180))) {
        const other = map.roads.find((o) => clearance.roadAt(p, 0, y + 0.25, y + 4.5, r.id, (id) => id === o.id));
        error("geometry.overlapHeight", path, `Deck ${other?.id} overlaps at ${p.x.toFixed(1)},${p.z.toFixed(1)}, Y=${y.toFixed(2)} with insufficient vertical clearance.`);
        break;
      }
      const overlaps2 = clearance.roadAt(p, 0, y - 0.25, y + 0.25, r.id, (other) => !sharedBranch(r.id, other, p, 180));
      if (overlaps2 && !clearance.junctionAt(p, 0, y - 0.25, y + 0.25)) {
        const other = map.roads.find((o) => clearance.roadAt(p, 0, y - 0.25, y + 0.25, r.id, (id) => id === o.id && !sharedBranch(r.id, id, p, 180)));
        error("geometry.overlap", path, `Unconnected paved road ${other?.id} overlaps away from a branch throat at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}, Y=${y.toFixed(2)}.`);
        break;
      }
    }
    for (const pier of roadPiers(r, map, clearance)) if (clearance.roadAt(pier.position, 0.65, pier.baseY, pier.baseY + pier.height, r.id) || clearance.junctionAt(pier.position, 0.65, pier.baseY, pier.baseY + pier.height)) error("geometry.pier", path, "Pier intrudes into a lower paved footprint.");
  }
  for (const o of map.objects) if (["tree", "streetlight", "traffic_sign"].includes(o.prefabId) && !clearance.permitsProp(o.position, o.prefabId === "tree" ? 2.1 : 0.8, o.prefabId === "tree" ? 6.8 : o.prefabId === "streetlight" ? 7.5 : 2.85)) error("geometry.prop", `objects.${o.id}`, "Roadside prop enters pavement, an overhead deck or junction clear zone.");
  const tangent = (id, end) => {
    const pts = paths.find((p) => p.road.id === id).points, length = polylineLength(pts);
    return sampleAt(pts, end === "start" ? 0 : length).tangent;
  };
  for (const l of map.roadLinks ?? []) {
    if (targets && !targets.has(l.from.roadId) && !targets.has(l.to.roadId)) continue;
    const a = paths.find((p) => p.road.id === l.from.roadId).road, b = paths.find((p) => p.road.id === l.to.roadId).road;
    const incoming = (r, e) => r.travelDirection === "two-way" || r.travelDirection === "forward" === (e === "end");
    const outgoing = (r, e) => r.travelDirection === "two-way" || r.travelDirection === "forward" === (e === "start");
    if (!(incoming(a, l.from.end) && outgoing(b, l.to.end) || incoming(b, l.to.end) && outgoing(a, l.from.end))) error("geometry.direction", `roadLinks.${l.id}`, "Join has no compatible incoming/outgoing carriageway.");
    const ta = tangent(a.id, l.from.end), tb = tangent(b.id, l.to.end);
    const sign = l.from.end === l.to.end ? -1 : 1;
    if ((ta.x * tb.x + ta.z * tb.z) * sign < Math.cos(Math.PI / 6)) error("geometry.joinHeading", `roadLinks.${l.id}`, "Join turns more than 30 degrees at one node.");
  }
  for (let ri = 0; ri < paths.length; ri++) for (let rj = ri; rj < paths.length; rj++) {
    const aPath = paths[ri], bPath = paths[rj];
    if (targets && !targets.has(aPath.road.id) && !targets.has(bPath.road.id)) continue;
    const ab = aPath.bounds, bb = bPath.bounds;
    if (ab.maxX < bb.minX || bb.maxX < ab.minX || ab.maxZ < bb.minZ || bb.maxZ < ab.minZ) continue;
    let found = false;
    for (let i = 1; i < aPath.points.length && !found; i++) for (let j = ri === rj ? i + 2 : 1; j < bPath.points.length; j++) {
      const a = aPath.points[i - 1], b = aPath.points[i], c = bPath.points[j - 1], d = bPath.points[j];
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) || Math.max(a.z, b.z) < Math.min(c.z, d.z) || Math.max(c.z, d.z) < Math.min(a.z, b.z)) continue;
      const ax = b.x - a.x, az = b.z - a.z, bx = d.x - c.x, bz = d.z - c.z, den = ax * bz - az * bx;
      if (Math.abs(den) < 1e-5) continue;
      const t = ((c.x - a.x) * bz - (c.z - a.z) * bx) / den, u = ((c.x - a.x) * az - (c.z - a.z) * ax) / den;
      if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
      const p = { x: a.x + ax * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + az * t };
      const y = (c.y ?? 0) + ((d.y ?? 0) - (c.y ?? 0)) * u;
      if (Math.abs(p.y - y) >= 4.5) continue;
      if (clearance.junctionAt(p, 0, p.y - 0.2, p.y + 0.2)) continue;
      const joined = sharedBranch(aPath.road.id, bPath.road.id, p, 20);
      if (joined) continue;
      error("geometry.crossing", `roads.${aPath.road.id}/${bPath.road.id}`, `Unconnected crossing at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) has ${Math.abs(p.y - y).toFixed(2)}m separation, less than 4.5m.`);
      found = true;
      break;
    }
  }
  return issues;
}

// src/world/city/RoadSignTemplates.ts
var ROAD_SIGN_SIZES = { small: { width: 3.2, height: 0.95 }, medium: { width: 6, height: 2.3 }, large: { width: 10, height: 3.8 } };
var ROAD_SIGN_POST_Z = -0.2;
var ROAD_SIGN_TEMPLATES = {
  "single-post": { bottom: 3.3, posts: [0], poleTop: 4.8 },
  "dual-post": { bottom: 3.3, posts: [-2.3, 2.3], poleTop: 5.7 },
  // A roadside cantilever keeps supports outside both opposing carriageways.
  "gantry": { bottom: 6.5, posts: [12], poleTop: 10.5 },
  "highway-gantry": { bottom: 6.5, posts: [-7, 9], poleTop: 12.8 },
  "ramp-confirmation": { bottom: 3.1, posts: [0], poleTop: 4.7 },
  "urban-name": { bottom: 2.8, posts: [0], poleTop: 3.8 },
  "ceiling": { bottom: 4.5, posts: [], poleTop: 6 },
  "speed-limit": { bottom: 2.1, posts: [0], poleTop: 3.35 },
  "chevron": { bottom: 1.35, posts: [0], poleTop: 2.3 }
};
function signDimensions(template, size, postOffset, gantryPosts, mountHeight = 6) {
  return { ...ROAD_SIGN_SIZES[size], ...ROAD_SIGN_TEMPLATES[template], ...template === "gantry" && postOffset !== void 0 ? { posts: [postOffset] } : {}, ...template === "highway-gantry" ? { posts: gantryPosts ?? [-7, 9], width: Math.min(18, (gantryPosts?.[1] ?? 9) - (gantryPosts?.[0] ?? -7) - 0.5), height: 5.4 } : {}, ...template === "ceiling" ? { bottom: Math.min(5.5, mountHeight - 1.15), poleTop: mountHeight, height: 1, width: Math.min(8, ROAD_SIGN_SIZES[size].width) } : {}, ...template === "speed-limit" ? { width: 1.2, height: 1.2 } : {}, ...template === "chevron" ? { width: 1.8, height: 0.9 } : {} };
}

// src/world/city/RoadSignValidation.ts
function validateRoadSignData(map) {
  const issues = [], error = (path, message) => issues.push({ severity: "error", code: "sign.invalid", path, message });
  if (map.roadNames !== void 0) {
    if (!map.roadNames || typeof map.roadNames !== "object" || Array.isArray(map.roadNames)) {
      error("roadNames", "Expected road-name registry.");
      return issues;
    }
    for (const [id, name] of Object.entries(map.roadNames)) if (!id || !name || typeof name.primaryText !== "string" || !name.primaryText || name.secondaryText !== void 0 && typeof name.secondaryText !== "string" || !["expressway", "urban", "interchange", "destination"].includes(name.kind)) error("roadNames." + id, "Expected primaryText, optional secondaryText and name category.");
  }
  for (const r of map.roads) if (r.roadNameId && !map.roadNames?.[r.roadNameId]) error("roads." + r.id, "Unknown roadNameId.");
  if (map.signs === void 0) return issues;
  if (!Array.isArray(map.signs)) {
    error("signs", "Expected sign definitions array.");
    return issues;
  }
  const ids = new Set([...map.roads, ...map.objects, ...map.intersections, ...map.connectionPorts ?? [], ...map.roadLinks ?? []].map((o) => o.id));
  for (let i = 0; i < map.signs.length; i++) {
    const s = map.signs[i], path = "signs[" + i + "]";
    if (!s || typeof s.id !== "string" || !s.id || ids.has(s.id)) {
      error(path, "Missing/duplicate sign ID.");
      continue;
    }
    ids.add(s.id);
    if (!Object.hasOwn(ROAD_SIGN_TEMPLATES, s.template) || !Object.hasOwn(ROAD_SIGN_SIZES, s.size) || !["EXPRESSWAY_ADVANCE", "EXPRESSWAY_DIVERGE", "EXPRESSWAY_ENTRY", "EXPRESSWAY_DISTANCE", "EXPRESSWAY_SERVICE", "RAMP_CONFIRMATION", "URBAN_DIRECTION", "ROAD_NAME", "INTERCHANGE_NAME", "SPEED_LIMIT", "CHEVRON"].includes(s.type)) error(path, "Unknown sign type/template/size.");
    if (!map.roads.some((r) => r.id === s.roadId) || !s.position || ![s.position.x, s.position.y ?? 0, s.position.z, s.heading].every(Number.isFinite) || !["forward", "reverse"].includes(s.laneDirection) || s.language !== "zh-CN") error(path, "Sign needs a road reference, finite pose and valid approach direction/language.");
    if (s.interchangeId && !map.roadNames?.[s.interchangeId]) error(path, "Unknown interchange ID.");
    if (s.approachRoadNameId && !map.roadNames?.[s.approachRoadNameId]) error(path, "Unknown approach road name.");
    if (s.urbanLayout !== void 0 && (s.urbanLayout !== "junction-diagram" || !["ROAD_NAME", "URBAN_DIRECTION"].includes(s.type) || s.highwayLayout)) error(path, "Urban junction diagrams require an urban direction/name sign.");
    const safety = s.type === "SPEED_LIMIT" || s.type === "CHEVRON";
    if (s.type === "SPEED_LIMIT" && (s.template !== "speed-limit" || !Number.isInteger(s.speedLimitKmh) || s.speedLimitKmh < 5 || s.speedLimitKmh > 160)) error(path, "Speed board requires a speed-limit template and a 5\u2013160 km/h integer limit.");
    if (s.type === "CHEVRON" && (s.template !== "chevron" || !["left", "right"].includes(s.chevronDirection))) error(path, "Chevron board requires its template and a driver-relative turn direction.");
    if (s.template === "speed-limit" !== (s.type === "SPEED_LIMIT") || s.template === "chevron" !== (s.type === "CHEVRON")) error(path, "Safety templates must match their sign type.");
    if (!Array.isArray(s.destinations) || (safety ? s.destinations.length !== 0 : !s.destinations.length || s.destinations.length > 4)) error(path, safety ? "Safety boards do not contain navigation destinations." : "Expected one to four destinations (including five-leg junctions).");
    else for (const d of s.destinations) if (!d || !map.roadNames?.[d.roadNameId] || d.directionId && !map.roadNames?.[d.directionId] || !["straight", "left", "right", "exit-right", "exit-left"].includes(d.arrow) || d.distanceMetres !== void 0 && (!Number.isFinite(d.distanceMetres) || d.distanceMetres < 0)) error(path, "Invalid destination reference/arrow/distance.");
    if (s.gantryPosts && (s.template !== "highway-gantry" || s.gantryPosts.length !== 2 || !s.gantryPosts.every(Number.isFinite) || s.gantryPosts[0] >= 0 || s.gantryPosts[1] <= 0 || s.gantryPosts[1] - s.gantryPosts[0] > 40)) error(path, "Highway gantry requires two finite shoulder supports.");
    if (s.exitNumber !== void 0 && typeof s.exitNumber !== "string") error(path, "exitNumber must be optional text.");
    if (s.laneArrows && (!s.laneArrows.length || s.laneArrows.some((a) => !["straight", "exit-right", "exit-left"].includes(a)))) error(path, "Invalid driver-relative lane arrows.");
    if (s.postOffset !== void 0 && (!Number.isFinite(s.postOffset) || Math.abs(s.postOffset) <= 0 || Math.abs(s.postOffset) > 30 || s.template !== "gantry")) error(path, "Cantilever post requires a gantry and a finite signed 0\u201330 m offset.");
    if (s.mountHeight !== void 0 && (!Number.isFinite(s.mountHeight) || s.mountHeight < 5.75 || s.mountHeight > 30 || s.template !== "ceiling")) error(path, "Suspended board requires a ceiling template and a finite underside height.");
    if (s.postBaseY !== void 0 && (!Number.isFinite(s.postBaseY) || s.postBaseY > (s.position.y ?? 0) || s.template === "highway-gantry" || s.template === "ceiling")) error(path, "Ground-founded support must end at or below its road anchor; shoulder gantries and ceiling boards remain road-mounted.");
    if (s.stationMetres !== void 0) {
      const road = map.roads.find((r) => r.id === s.roadId);
      if (!Number.isFinite(s.stationMetres) || s.stationMetres < 0 || road && s.stationMetres > polylineLength(roadPoints(road)) + 0.01) error(path, "Sign station must lie on its logical road.");
    }
    if (s.incomingRoadId && !map.roads.some((r) => r.id === s.incomingRoadId) || s.outgoingRoadIds?.some((id) => !map.roads.some((r) => r.id === id))) error(path, "Unknown topology provenance road.");
  }
  return issues;
}

// src/world/regional/HighwayValidation.ts
function validateHighwayData(map) {
  const system = map.regional?.highways;
  if (!system) return [];
  const issues = [], error = (path, message) => issues.push({ severity: "error", code: "highway.invalid", path: "regional.highways." + path, message });
  if (system.version !== 1 || !Array.isArray(system.routes) || !Array.isArray(system.exits) || !Array.isArray(system.junctions) || !Array.isArray(system.services)) {
    error("", "Expected versioned route, exit, junction and service arrays.");
    return issues;
  }
  if ([...system.routes, ...system.exits, ...system.junctions, ...system.services].some((v) => !v || typeof v !== "object")) {
    error("", "Expected highway records.");
    return issues;
  }
  const roads = new Map(map.roads.map((r) => [r.id, r])), ids = /* @__PURE__ */ new Set(), routes = new Set(system.routes.map((r) => r.id));
  const roadIds = (list, path) => {
    if (!Array.isArray(list) || !list.length || list.some((id) => typeof id !== "string" || !roads.has(id))) error(path, "Expected nonempty existing road references.");
  };
  const node = (id, name, position, path) => {
    if (!id || ids.has(id) || !name) error(path, "Expected unique ID and nonempty name.");
    ids.add(id);
    if (!position || ![position.x, position.y ?? 0, position.z].every(Number.isFinite)) error(path, "Expected a finite node position.");
  };
  system.routes.forEach((r, i) => {
    const path = `routes[${i}]`;
    if (!r.id || ids.has(r.id) || !r.name || !["national", "provincial", "connector"].includes(r.type) || !r.direction?.forward || !r.direction.reverse || !/^G\d{2,4}$|^S\d{2}$/.test(r.number)) error(path, "Expected unique route, number, type and two directions.");
    ids.add(r.id);
    if (map.roadNames?.[r.id]?.routeNumber !== r.number) error(path, "Display number must agree with sign registry.");
    roadIds(r.roadIds, path);
  });
  system.exits.forEach((e, i) => {
    const path = `exits[${i}]`;
    node(e.id, e.name, e.position, path);
    roadIds(e.roadIds, path);
    if (!routes.has(e.highway) || !e.exitNumber || !Array.isArray(e.destinations) || !e.destinations.length || e.destinations.some((d) => !d)) error(path, "Expected highway, exit number and destinations.");
  });
  system.junctions.forEach((j, i) => {
    const path = `junctions[${i}]`;
    node(j.id, j.name, j.position, path);
    roadIds(j.roadIds, path);
    if (!["interchange", "continuation"].includes(j.kind) || !Array.isArray(j.connectedRoutes) || j.connectedRoutes.length < 2 || j.connectedRoutes.some((id) => !routes.has(id) || !j.directions?.[id]?.forward || !j.directions[id].reverse)) error(path, "Expected junction kind, connected routes and matching directions.");
  });
  system.services.forEach((s, i) => {
    const path = `services[${i}]`;
    node(s.id, s.name, s.position, path);
    roadIds(s.roadIds, path);
    if (!routes.has(s.highway) || !Array.isArray(s.facilities) || !s.facilities.length || s.facilities.some((f) => !["parking", "fuel", "charging", "food", "toilet"].includes(f))) error(path, "Expected highway and known facilities.");
  });
  if (Number(map.environment.metadata?.highwayNetworkRevision) >= 2) {
    const numbers = /* @__PURE__ */ new Set();
    system.routes.forEach((r, i) => {
      if (numbers.has(r.number)) error(`routes[${i}]`, "Duplicate displayed highway number.");
      numbers.add(r.number);
      if (r.number.startsWith("S") && Number(r.number.slice(1)) > 40) error(`routes[${i}]`, "Provincial highways must use numbers at or below 40.");
      if (!["trunk", "orbital", "connector", "branch"].includes(r.role ?? "") || !r.termini?.start || !r.termini.end) error(`routes[${i}]`, "Revision 2 requires network roles and explained termini.");
      if (r.roadIds.some((id) => roads.get(id)?.roadNameId !== r.id)) error(`routes[${i}]`, "Mainline ownership disagrees with route registry.");
    });
  }
  return issues;
}

// src/world/city/CityMapValidation.ts
var RECOMMENDED_GRADE = 0.12;
var MAXIMUM_GRADE = 0.25;
var pointHeight = (p) => p.y ?? 0;
function validateMap(value) {
  const errors = [], warnings = [];
  const result = () => ({ valid: errors.length === 0, errors, warnings, errorCount: errors.length, warningCount: warnings.length });
  const issue2 = (code, path, message, severity = "error") => (severity === "error" ? errors : warnings).push({ severity, code, path, message });
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  const point = (v) => !!v && finite(v.x) && finite(v.z) && (v.y === void 0 || finite(v.y) && v.y >= -50 && v.y <= 100);
  if (!value || typeof value !== "object") {
    issue2("map.invalid", "$", "Expected CityMap object.");
    return result();
  }
  const m = value;
  if (typeof m.id !== "string" || !m.id || typeof m.name !== "string") issue2("metadata.invalid", "$", "Nonempty id and name required.");
  if (!Number.isInteger(m.version) || m.version < 1) issue2("version.invalid", "version", "Expected positive integer.");
  if (m.schemaVersion !== void 0 && ![1, 2].includes(m.schemaVersion)) issue2("schema.invalid", "schemaVersion", "Supported schema versions: 1, 2.");
  if (!finite(m.sectorSize) || m.sectorSize < 50 || m.sectorSize > 2e3) issue2("sector.invalid", "sectorSize", "Expected 50\u20132000 metres.");
  const b = m.bounds;
  if (!b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(finite) || b.minX >= b.maxX || b.minZ >= b.maxZ || b.maxX - b.minX > 2e5 || b.maxZ - b.minZ > 2e5) issue2("bounds.invalid", "bounds", "Finite ordered bounds, at most 200km per axis, required.");
  for (const key of ["roads", "intersections", "objects"]) if (!Array.isArray(m[key])) issue2("array.required", key, "Expected array.");
  if (errors.some((e) => e.code === "array.required")) return result();
  errors.push(...validateRoadSignData(m));
  const ids = /* @__PURE__ */ new Set();
  for (const key of ["roads", "intersections", "objects", "roadLinks", "connectionPorts"]) {
    const list = m[key];
    if (list === void 0) continue;
    if (!Array.isArray(list)) {
      issue2("array.invalid", key, "Expected array.");
      continue;
    }
    list.forEach((e, index) => {
      const path = `${key}[${index}]`;
      if (!e || typeof e.id !== "string" || !e.id || ids.has(e.id)) issue2("id.duplicate", path, "Missing or duplicate element ID.");
      else ids.add(e.id);
      if (e && typeof e === "object" && "presetSource" in e && e.presetSource && !catalog_default.presets.some((p) => p.id === e.presetSource)) issue2("preset.invalid", path, `Unknown presetSource: ${e.presetSource}`);
    });
  }
  for (let index = 0; index < m.roads.length; index++) {
    const r = m.roads[index], path = `roads[${index}]`;
    if (!r) continue;
    if (r.type !== void 0 && !Object.hasOwn(ROAD_LANES, r.type) || !Number.isInteger(r.laneCount) || (r.crossSection || r.type === "highway" ? r.laneCount < 1 || r.laneCount > (r.crossSection ? 8 : 6) : r.type === void 0 || r.laneCount !== ROAD_LANES[r.type])) issue2("lanes.invalid", path, "Cross sections support 1\u20138 lanes; legacy highway supports 1\u20136 and urban/ramp types fix count.");
    if (r.type === void 0 && r.roadClass === void 0) issue2("road.class", path, "New roads require an explicit traffic function.");
    if (r.crossSection !== void 0 && !Object.hasOwn(ROAD_CROSS_SECTIONS, r.crossSection)) issue2("road.crossSection", path, "Unknown geometric cross-section preset.");
    if (!finite(r.laneWidth) || r.laneWidth < 2 || r.laneWidth > 6 || !finite(r.speedLimit) || r.speedLimit <= 0 || r.speedLimit > 200) issue2("road.properties", path, "Lane width 2\u20136m, speed 1\u2013200km/h required.");
    if (!["two-way", "forward", "reverse"].includes(r.travelDirection) || r.travelDirection === "two-way" && r.laneCount % 2 !== 0) issue2("direction.invalid", path, "Two-way roads require an even lane count.");
    if (r.styleId && !ROAD_STYLES.some((s2) => s2.id === r.styleId)) issue2("style.invalid", path, `Unknown road style: ${r.styleId}`);
    if (r.designProfile !== void 0 && !["urban", "motorway"].includes(r.designProfile)) issue2("design.profile", path, "Expected urban or motorway design profile.");
    if (r.roadClass !== void 0 && !["expressway", "arterial", "collector", "local", "frontage", "ramp", "connector", "avenue", "alley", "industrial"].includes(r.roadClass)) issue2("road.class", path, "Unknown road function.");
    if (r.displayName !== void 0 && (typeof r.displayName !== "string" || r.displayName.length > 100)) issue2("road.displayName", path, "Optional player name must be a string of at most 100 characters; empty means unnamed.");
    if (r.decorationProfile !== void 0 && (typeof r.decorationProfile !== "string" || !r.decorationProfile.length || r.decorationProfile.length > 64)) issue2("road.decoration", path, "Decoration profile must be a nonempty key of at most 64 characters.");
    if (r.curve && !["polyline", "smooth"].includes(r.curve)) issue2("curve.invalid", path, "Expected polyline or smooth.");
    if (r.elevationMode && !["ground", "elevated", "custom"].includes(r.elevationMode)) issue2("elevation.mode", path, "Expected ground/elevated/custom.");
    if (r.elevationMode === "elevated" && (!finite(r.elevation ?? 6) || (r.elevation ?? 6) < 2.5 || (r.elevation ?? 6) > 100)) issue2("elevation.invalid", path, "Elevated height must be 2.5\u2013100m.");
    if (r.sidewalk && (typeof r.sidewalk.enabled !== "boolean" || !finite(r.sidewalk.width) || r.sidewalk.width < 0.5 || r.sidewalk.width > 10)) issue2("sidewalk.invalid", path, "Sidewalk width must be 0.5\u201310m.");
    if (r.shoulders && ![r.shoulders.left, r.shoulders.right].every((v) => finite(v) && v >= 0 && v <= 5)) issue2("shoulders.invalid", path, "Paved shoulder widths must be 0\u20135m.");
    if (r.structure?.barrierOffset !== void 0 && (!finite(r.structure.barrierOffset) || r.structure.barrierOffset < 0 || r.structure.barrierOffset > 2)) issue2("barrier.offset", path, "Barrier offset must be 0\u20132m outside pavement.");
    if (r.gore && (typeof r.gore.start !== "boolean" || typeof r.gore.end !== "boolean" || !finite(r.gore.length) || r.gore.length < 10 || r.gore.length > 300)) issue2("gore.invalid", path, "Gore needs boolean endpoints and 10\u2013300m length.");
    const s = r.structure;
    if (s && [s.barrierStyle, s.medianBarrierStyle].some((style) => style !== void 0 && !["metal", "concrete"].includes(style))) issue2("barrier.style", path, "Expected metal or concrete barriers.");
    if (s?.enclosure && (!["tunnel", "underpass", "cutting"].includes(s.enclosure.kind) || !finite(s.enclosure.clearance) || s.enclosure.clearance < 5 || s.enclosure.clearance > 10)) issue2("enclosure.invalid", path, "Enclosed roads require a known kind and 5\u201310m clear height.");
    if (s && (s.pierSpacing !== void 0 && (!finite(s.pierSpacing) || s.pierSpacing < 10 || s.pierSpacing > 100) || s.pierStyle !== void 0 && !["round", "rectangular"].includes(s.pierStyle) || s.barrierEnabled !== void 0 && typeof s.barrierEnabled !== "boolean" || s.piersEnabled !== void 0 && typeof s.piersEnabled !== "boolean")) issue2("structure.invalid", path, "Pier spacing 10\u2013100m, style round/rectangular, flags boolean.");
    if (!Array.isArray(r.centerline) || r.centerline.length < 2 || !r.centerline.every(point)) {
      issue2("elevation.node", path, "Two finite {x,y?,z} nodes required; Y range -50\u2013100m.");
      continue;
    }
    const separation = (a, b2) => Math.hypot(a.x - b2.x, a.z - b2.z);
    if (separation(r.centerline[0], r.centerline.at(-1)) < 0.05 || r.centerline.some((p, i) => i > 0 && separation(p, r.centerline[i - 1]) < 0.05)) {
      issue2("road.degenerate", `${path}.centerline`, "Distinct start/end and consecutive nodes need at least 0.05m horizontal separation.");
      continue;
    }
    let maxGrade2 = 0;
    const points = roadPoints(r);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], c = points[i], length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 0.05) {
        issue2("road.degenerate", `${path}.centerline`, "Consecutive nodes need horizontal separation.");
        break;
      }
      maxGrade2 = Math.max(maxGrade2, Math.abs(pointHeight(c) - pointHeight(a)) / length);
    }
    if (maxGrade2 > MAXIMUM_GRADE) issue2("slope.extreme", path, `Grade ${(maxGrade2 * 100).toFixed(1)}% exceeds hard limit 25%.`);
    else if (maxGrade2 > RECOMMENDED_GRADE) issue2("slope.recommended", path, `Grade ${(maxGrade2 * 100).toFixed(1)}% exceeds recommended 12%.`, "warning");
  }
  const endpoint2 = (e, path) => {
    const r = e && m.roads.find((r2) => r2?.id === e.roadId);
    if (!e || !r || !["start", "end"].includes(e.end) || !Array.isArray(r.centerline) || !r.centerline.length) {
      issue2("connection.broken", path, "Unknown roadId or invalid endpoint.");
      return;
    }
    const p = e.end === "start" ? r.centerline[0] : r.centerline.at(-1);
    return p && { ...p, y: r.elevationMode === "ground" ? 0 : r.elevationMode === "elevated" ? r.elevation ?? 6 : pointHeight(p) };
  };
  const used = /* @__PURE__ */ new Set();
  for (let index = 0; index < m.intersections.length; index++) {
    const j = m.intersections[index], path = `intersections[${index}]`;
    if (!j) continue;
    if (!Object.hasOwn(INTERSECTION_LANES, j.type) || !point(j.position) || !finite(j.rotation) || typeof j.signalized !== "boolean" || !Array.isArray(j.connections)) {
      issue2("junction.invalid", path, "Invalid type, position, rotation, signalized or connections.");
      continue;
    }
    const ports = /* @__PURE__ */ new Set();
    if (j.pavementFootprint && (!Array.isArray(j.pavementFootprint) || j.pavementFootprint.length < 3 || !j.pavementFootprint.every(point))) issue2("junction.pavement", path, "Pavement outline needs at least three finite local points.");
    if (j.pavementHeights && Object.values(j.pavementHeights).some((y) => !finite(y) || y < -50 || y > 100)) issue2("junction.pavementHeight", path, "Approach heights must be finite metres.");
    const expected = j.type === "divided_cross" ? 6 : j.type === "irregular" ? 5 : j.type.startsWith("t_") ? 3 : 4;
    if (j.approachOffsets && Object.entries(j.approachOffsets).some(([port, p]) => !portsFor(j).includes(port) || !point(p))) issue2("junction.offset", path, "Finite approach offsets on valid ports required.");
    if (j.portAngles !== void 0 && (!j.portAngles || typeof j.portAngles !== "object" || Object.entries(j.portAngles).some(([port, angle]) => !portsFor(j).includes(port) || !finite(angle)))) issue2("junction.angles", path, "Finite local bearings on valid ports required.");
    if (j.channelized !== void 0 && typeof j.channelized !== "boolean") issue2("junction.channelized", path, "Channelized flag must be boolean.");
    if (j.signals?.profile !== void 0 && !["standard", "lane-countdown"].includes(j.signals.profile)) issue2("signal.profile", path, "Unknown signal profile.");
    if (j.signals?.placements) {
      for (const [port, placement] of Object.entries(j.signals.placements)) if (!portsFor(j).includes(port) || !placement || !point(placement.position) || !finite(placement.heading) || placement.headHeight !== void 0 && (!finite(placement.headHeight) || placement.headHeight < (j.signals.profile ? 7.2 : 3) || placement.headHeight > 12)) issue2("signal.placement", path, "Signal placement requires a valid approach, XYZ and heading.");
    }
    for (const [key, min, max] of [["throughGreenSeconds", 8, 90], ["leftGreenSeconds", 5, 45], ["amberSeconds", 2, 6], ["allRedSeconds", 1, 5]]) {
      const duration = j.signals?.[key];
      if (duration !== void 0 && (!finite(duration) || duration < min || duration > max)) issue2("signal.timing", path, `${key} must be ${min}\u2013${max} seconds.`);
    }
    if (j.connections.length < expected) issue2("junction.weak", path, `${j.id}: ${j.connections.length}/${expected} arms. Preserve the authored junction; inspect missing approaches.`, "warning");
    for (const c of j.connections) {
      const p = endpoint2(c, path), key = `${c?.roadId}:${c?.end}`;
      if (!c || !portsFor(j).includes(c.port) || ports.has(c.port) || used.has(key)) issue2("port.conflict", path, "A port and road endpoint each allow one junction connection.");
      if (c) {
        ports.add(c.port);
        used.add(key);
      }
      const expectedHeight = j.pavementHeights?.[c.port] ?? pointHeight(j.position);
      if (p && Math.abs(pointHeight(p) - expectedHeight) > 0.2) issue2("height.mismatch", path, `Road ${c.roadId}:${c.end} Y=${p.y} differs from junction mouth Y=${expectedHeight}.`);
    }
    if (j.signals && (j.signals.offsetSeconds !== void 0 && !finite(j.signals.offsetSeconds) || j.signals.headHeight !== void 0 && (!finite(j.signals.headHeight) || j.signals.headHeight < 3 || j.signals.headHeight > 12))) issue2("signals.invalid", path, "Invalid signal offset/head height.");
    const f = j.markingFootprint;
    if (f && (f.kind === "junction" ? f.margin !== void 0 && (!finite(f.margin) || f.margin < 0 || f.margin > 5) : f.kind === "rectangle" ? ![f.halfWidth, f.halfDepth].every((v) => finite(v) && v >= 2 && v <= 100) : f.kind === "polygon" ? !Array.isArray(f.points) || f.points.length < 3 || !f.points.every(point) : true)) issue2("marking.footprint", path, "Invalid marking suppression footprint.");
    if (j.approaches) {
      for (const [port, a] of Object.entries(j.approaches)) if (!portsFor(j).includes(port) || !a || !Array.isArray(a.lanes) || a.lanes.some((l) => !["straight", "left", "right", "straight-left", "straight-right", "left-right"].includes(l)) || a.arrowDistance !== void 0 && (!finite(a.arrowDistance) || a.arrowDistance < 25 || a.arrowDistance > 50)) issue2("marking.approach", path, "Lane arrow metadata requires valid movements and a 25\u201350m approach distance.");
    }
  }
  const linkedPairs = /* @__PURE__ */ new Set();
  if (Array.isArray(m.roadLinks)) for (const link of m.roadLinks) {
    for (const e of [link?.from, link?.to]) if (e && Object.keys(e).some((k2) => k2 !== "roadId" && k2 !== "end")) issue2("connection.shape", `roadLinks.${link?.id}`, "Expected exactly {roadId,end}; not a node/port object.");
    if (link?.from && link?.to) {
      const pair = [`${link.from.roadId}:${link.from.end}`, `${link.to.roadId}:${link.to.end}`].sort().join("|");
      if (linkedPairs.has(pair)) issue2("connection.duplicate", `roadLinks.${link.id}`, "Duplicate undirected endpoint connection.");
      linkedPairs.add(pair);
    }
    const a = endpoint2(link?.from, `roadLinks.${link?.id}`), c = endpoint2(link?.to, `roadLinks.${link?.id}`);
    if (a && c && Math.abs(pointHeight(a) - pointHeight(c)) > 0.2) issue2("height.mismatch", `roadLinks.${link.id}`, "Linked endpoints have different heights.");
    if (a && c && Math.hypot(a.x - c.x, a.z - c.z) > 0.2) issue2("connection.gap", `roadLinks.${link.id}`, "Linked endpoints must coincide within 0.2m.");
    if ([link?.from, link?.to].some((e) => e && used.has(`${e.roadId}:${e.end}`))) issue2("port.conflict", `roadLinks.${link?.id}`, "An endpoint attached to a junction cannot also use a roadLink.");
    if (link?.from?.roadId === link?.to?.roadId && link?.from?.end === link?.to?.end) issue2("connection.self", `roadLinks.${link?.id}`, "Cannot connect an endpoint to itself.");
  }
  if (Array.isArray(m.connectionPorts)) for (const port of m.connectionPorts) {
    const p = endpoint2(port?.endpoint, `connectionPorts.${port?.id}`);
    if (!port || typeof port.label !== "string" || !port.label) issue2("port.invalid", `connectionPorts.${port?.id}`, "Nonempty port label required.");
    if (port?.endpoint && Object.keys(port.endpoint).some((k2) => k2 !== "roadId" && k2 !== "end")) issue2("connection.shape", `connectionPorts.${port.id}`, "Port endpoint must be exactly {roadId,end}.");
    const e = port?.endpoint;
    if (port?.position && (!point(port.position) || p && Math.hypot(port.position.x - p.x, port.position.z - p.z, (port.position.y ?? 0) - (p.y ?? 0)) > 0.2)) issue2("port.endpointMismatch", `connectionPorts.${port.id}`, "Port pose differs from its actual endpoint.");
    if (port?.heading !== void 0) {
      const r = m.roads.find((r2) => r2.id === e?.roadId);
      if (!finite(port.heading)) issue2("port.headingMismatch", `connectionPorts.${port.id}`, "Finite port heading required.");
      else if (r && e && r.centerline.length >= 2 && r.centerline.every(point)) {
        if (directionalPortLabel(port.label, port.heading) !== port.label) issue2("port.directionMismatch", `connectionPorts.${port.id}`, "Directional label does not match world heading.");
        const pts = roadPoints(r), a = e.end === "start" ? pts[0] : pts.at(-1), b2 = e.end === "start" ? pts[1] : pts.at(-2);
        const expected = Math.atan2(a.x - b2.x, -(a.z - b2.z));
        if (Math.abs(Math.atan2(Math.sin(port.heading - expected), Math.cos(port.heading - expected))) > 0.05) issue2("port.headingMismatch", `connectionPorts.${port.id}`, "Port heading differs from outward endpoint tangent.");
      }
    }
    if (p && e && !used.has(`${e.roadId}:${e.end}`) && !(Array.isArray(m.roadLinks) && m.roadLinks.some((l) => [l?.from, l?.to].some((q) => q?.roadId === e.roadId && q.end === e.end)))) {
      issue2("port.unused", `connectionPorts.${port.id}`, `${port.label}: external endpoint reserved for future continuation.`, "warning");
    }
  }
  m.objects.forEach((o, i) => {
    if (!o || !PREFAB_IDS.includes(o.prefabId) || !point(o.position) || !finite(o.rotation)) issue2("prefab.invalid", `objects[${i}]`, "Unknown prefab or invalid transform.");
    if (o?.scale && ![o.scale.x, o.scale.y, o.scale.z].every((v) => finite(v) && v > 0 && v <= 20)) issue2("scale.invalid", `objects[${i}]`, "Scale axes must be positive and \u226420.");
    if (o?.color && !/^#[0-9a-f]{6}$/i.test(o.color)) issue2("color.invalid", `objects[${i}]`, "Color must be #RRGGBB.");
    if (o?.label !== void 0 && (typeof o.label !== "string" || o.label.length > 64)) issue2("label.invalid", `objects[${i}]`, "Sign label must be at most 64 characters.");
    if (o?.facade !== void 0 && !["residential", "office", "old-town", "industrial", "campus"].includes(o.facade)) issue2("facade.invalid", `objects[${i}]`, "Unknown shared facade profile.");
    if (o?.buildingShape !== void 0 && !["box", "chamfered", "slab", "courtyard"].includes(o.buildingShape)) issue2("building.shape", `objects[${i}]`, "Unknown shared building footprint.");
    if (o?.landmarkModel !== void 0 && !["station", "government", "museum", "university", "exhibition", "tower", "stadium", "arena"].includes(o.landmarkModel)) issue2("building.landmark", `objects[${i}]`, "Unknown landmark model.");
  });
  if (!m.environment || !Array.isArray(m.environment.districts) || !Array.isArray(m.environment.spawnPoints) || !m.environment.spawnPoints.length) issue2("spawn.missing", "environment", "District array and at least one spawn required.");
  else for (const s of m.environment.spawnPoints) if (!s || typeof s.id !== "string" || !point(s.position) || !finite(s.rotation)) issue2("spawn.invalid", "environment.spawnPoints", "Invalid spawn.");
  if (m.environment?.corridors !== void 0 && !Array.isArray(m.environment.corridors)) issue2("corridor.invalid", "environment.corridors", "Corridors must be an array.");
  else for (const corridor of m.environment?.corridors ?? []) if (!corridor || typeof corridor.id !== "string" || !corridor.id || typeof corridor.name !== "string" || !corridor.name || !["waterway", "railway"].includes(corridor.kind) || !finite(corridor.width) || corridor.width < 1 || corridor.width > 100 || corridor.bankWidth !== void 0 && (!finite(corridor.bankWidth) || corridor.bankWidth < corridor.width) || !Array.isArray(corridor.centerline) || corridor.centerline.length < 2 || !corridor.centerline.every(point)) issue2("corridor.invalid", "environment.corridors", "Invalid geographic corridor.");
  if (m.environment?.landmarks !== void 0 && !Array.isArray(m.environment.landmarks)) issue2("landmark.invalid", "environment.landmarks", "Landmarks must be an array.");
  if (m.environment?.landforms !== void 0 && !Array.isArray(m.environment.landforms)) issue2("terrain.invalid", "environment.landforms", "Landforms must be an array.");
  else for (const f of m.environment?.landforms ?? []) if (!f || typeof f.id !== "string" || !f.id || !point(f.center) || !finite(f.radiusX) || !finite(f.radiusZ) || f.radiusX < 30 || f.radiusZ < 30 || !finite(f.height) || Math.abs(f.height) > 6) issue2("terrain.invalid", "environment.landforms", "Landforms require a center, radii of at least 30m and a height within \xB16m.");
  else for (const landmark of m.environment?.landmarks ?? []) if (!landmark || typeof landmark.id !== "string" || !landmark.id || typeof landmark.name !== "string" || !landmark.name || !point(landmark.position) || !Array.isArray(landmark.roadIds) || !landmark.roadIds.length || landmark.roadIds.some((id) => !m.roads.some((r) => r.id === id))) issue2("landmark.invalid", "environment.landmarks", "Landmark must refer to real access roads.");
  if (errors.length === 0 && b) for (const e of [...m.roads.flatMap((r) => r.centerline), ...m.intersections.map((j) => j.position), ...m.objects.map((o) => o.position)]) {
    if (e.x < b.minX || e.x > b.maxX || e.z < b.minZ || e.z > b.maxZ) {
      issue2("bounds.outside", "bounds", "Elements outside bounds; expand before driving there.", "warning");
      break;
    }
  }
  if (!errors.length && m.roads.length > 1) {
    const parent = new Map(m.roads.map((r) => [r.id, r.id]));
    const root = (id) => {
      let current = id;
      while (parent.get(current) !== current) current = parent.get(current);
      while (id !== current) {
        const next = parent.get(id);
        parent.set(id, current);
        id = next;
      }
      return current;
    };
    const join3 = (a, b2) => {
      parent.set(root(a), root(b2));
    };
    for (const l of m.roadLinks ?? []) join3(l.from.roadId, l.to.roadId);
    for (const j of m.intersections) for (const c of j.connections.slice(1)) join3(j.connections[0].roadId, c.roadId);
    const components = new Set(m.roads.map((r) => root(r.id))).size;
    if (components > 1) issue2("network.sparse", "roads", `${components} separate road components; projected crossings do not imply connectivity.`, "warning");
  }
  if (m.editing) {
    const editor = m.editing, roadIds = new Set(m.roads.map((r) => r.id)), entityIds = new Set([...m.roads, ...m.intersections, ...m.objects].map((e) => e.id)), editorIds = /* @__PURE__ */ new Set([...ids, ...(m.signs ?? []).map((s) => s.id)]);
    for (const key of ["corridors", "groups", "attachments", "ramps"]) {
      if (!Array.isArray(editor[key])) {
        issue2("editing.invalid", `editing.${key}`, "Expected authoring collection.");
        continue;
      }
      for (const e of editor[key]) {
        if (!e || typeof e.id !== "string" || !e.id || editorIds.has(e.id)) issue2("editing.id", `editing.${key}`, "Authoring IDs must be stable and unique.");
        else editorIds.add(e.id);
      }
    }
    if (Array.isArray(editor.corridors)) {
      for (const c of editor.corridors) if (typeof c.name !== "string" || !Array.isArray(c.roadIds) || c.roadIds.some((id) => !roadIds.has(id))) issue2("editing.corridor", "editing.corridors", "Corridors need a name and existing road references.");
    }
    if (Array.isArray(editor.groups)) {
      for (const g of editor.groups) if (typeof g.name !== "string" || typeof g.locked !== "boolean" || !["corridor", "intersection", "interchange"].includes(g.kind) || !Array.isArray(g.memberIds) || g.memberIds.some((id) => !entityIds.has(id))) issue2("editing.group", "editing.groups", "Groups need ordinary existing members and a lock state.");
    }
    if (Array.isArray(editor.attachments)) {
      for (const a of editor.attachments) if (!roadIds.has(a.sourceRoadId) || !roadIds.has(a.roadId) || a.sourceRoadId === a.roadId || !finite(a.offset)) issue2("editing.attachment", "editing.attachments", "Attachments need distinct existing source/child roads and a finite offset.");
    }
    if (Array.isArray(editor.ramps)) {
      for (const r of editor.ramps) if (!roadIds.has(r.roadId) || !roadIds.has(r.from?.roadId) || !roadIds.has(r.to?.roadId) || !["on", "off"].includes(r.kind)) issue2("editing.ramp", "editing.ramps", "Ramp metadata must reference existing roads.");
    }
    for (const [id, handles] of Object.entries(editor.curves ?? {})) if (!roadIds.has(id) || !Array.isArray(handles) || handles.length !== 4 || !handles.every(point)) issue2("editing.curve", "editing.curves", "Cubic authoring handles need an existing road and four finite points.");
  }
  if (!errors.length && m.environment.metadata?.productionGeometry === "true") errors.push(...validatePresetGeometry(m));
  if (!errors.length) errors.push(...validateHighwayData(m));
  return result();
}

// src/world/city/MarkingOwnership.ts
function populateIntersectionMarkingMetadata(map) {
  for (const j of map.intersections) {
    j.markingFootprint ??= { kind: "junction", margin: 0.4 };
    if (j.approaches !== void 0) continue;
    j.approaches = {};
    for (const port of portsFor(j)) {
      const c = j.connections.find((c2) => c2.port === port), r = map.roads.find((r2) => r2.id === c?.roadId);
      if (!r || isControlledAccessRoad(r) || r.travelDirection !== "two-way" && r.travelDirection === "forward" !== (c?.end === "end")) continue;
      const count = r.travelDirection === "two-way" ? r.laneCount / 2 : r.laneCount;
      const lanes = Array.from({ length: count }, (_, lane) => j.type.startsWith("t_") && port === "north" ? "left-right" : count === 1 ? "straight" : lane === 0 ? "straight-left" : lane === count - 1 ? "straight-right" : "straight");
      j.approaches[port] = { lanes, arrowDistance: 30 };
    }
  }
}

// src/world/city/CityMapIds.ts
var CityMapIds = class {
  used = /* @__PURE__ */ new Set();
  constructor(map) {
    if (map) for (const list of [map.roads, map.intersections, map.objects, map.roadLinks ?? [], map.connectionPorts ?? []]) {
      for (const item of list) {
        this.used.add(item.id);
        if ("groupId" in item && item.groupId) this.used.add(item.groupId);
      }
    }
  }
  allocate(baseName) {
    if (!baseName || typeof baseName !== "string") throw new Error("id.invalid: nonempty baseName required");
    let id = baseName, suffix = 2;
    while (this.used.has(id)) id = `${baseName}-${suffix++}`;
    this.used.add(id);
    return id;
  }
  explicit(id) {
    if (!id || this.used.has(id)) throw new Error(`id.duplicate: ${id}`);
    this.used.add(id);
    return id;
  }
};

// src/world/city/RoadConnections.ts
function checkedEndpoint(endpoint2) {
  if (!endpoint2 || typeof endpoint2 !== "object" || typeof endpoint2.roadId !== "string" || !["start", "end"].includes(endpoint2.end) || Object.keys(endpoint2).some((k2) => k2 !== "roadId" && k2 !== "end")) {
    throw new Error('connection.shape: expected exactly {roadId,end:"start"|"end"}; do not pass a node or port');
  }
  return { roadId: endpoint2.roadId, end: endpoint2.end };
}
function roadEndpoint(map, value) {
  const endpoint2 = checkedEndpoint(value), road = map.roads.find((r) => r.id === endpoint2.roadId);
  if (!road || road.centerline.length < 2) throw new Error(`connection.broken: ${endpoint2.roadId}`);
  const points = roadPoints({ ...road, curve: "polyline" });
  return { ...endpoint2.end === "start" ? points[0] : points.at(-1) };
}
var endpointKey = (e) => `${e.roadId}:${e.end}`;
var linkKey = (a, b) => [endpointKey(a), endpointKey(b)].sort().join("|");
function connectRoads(map, fromValue, toValue, options = {}) {
  const from = checkedEndpoint(fromValue), to = checkedEndpoint(toValue);
  const a = roadEndpoint(map, from), b = roadEndpoint(map, to);
  if (endpointKey(from) === endpointKey(to)) throw new Error("connection.self: cannot connect an endpoint to itself");
  if (Math.hypot(a.x - b.x, a.z - b.z) > 0.2 || Math.abs((a.y ?? 0) - (b.y ?? 0)) > 0.2) {
    throw new Error(`connection.gap: ${endpointKey(from)} / ${endpointKey(to)} must coincide in XYZ within 0.2m`);
  }
  if (map.intersections.some((j) => j.connections.some((c) => endpointKey(c) === endpointKey(from) || endpointKey(c) === endpointKey(to)))) {
    throw new Error("port.conflict: junction endpoints cannot also have road links");
  }
  const existing = (map.roadLinks ?? []).find((l) => linkKey(l.from, l.to) === linkKey(from, to));
  if (existing) throw new Error(`connection.duplicate: ${existing.id}`);
  const ids = new CityMapIds(map), id = options.id ? ids.explicit(options.id) : ids.allocate(options.baseName ?? "link");
  const link = { id, from, to };
  (map.roadLinks ??= []).push(link);
  return link;
}

// src/world/city/coordinates.ts
var point3 = (x, y, z) => ({ x, y, z });
function transformPoint3(point, position, rotation) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return point3(
    point.x * c + point.z * s + position.x,
    (point.y ?? 0) + (position.y ?? 0),
    -point.x * s + point.z * c + position.z
  );
}

// src/world/city/presets/BackbonePresets.ts
var SYSTEMS = ["system_cloverleaf", "system_cloverleaf_cd", "system_cloverstack_lite", "system_parclo_cd", "peripheral_motorway_junction"];
var isBackbonePreset = (id) => [...SYSTEMS, "urban_side_access", "divided_tunnel", "urban_underpass", "urban_main_aux"].includes(id);
var ease = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
};
function profileHeight(profile, offset, fallback, interpolation = "smooth") {
  if (!profile?.length) return fallback;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (offset <= b.offset) {
      const t = Math.max(0, Math.min(1, (offset - a.offset) / (b.offset - a.offset)));
      return a.height + (b.height - a.height) * (interpolation === "linear" ? t : ease(t));
    }
  }
  return profile.at(-1).height;
}
function bezierPoints(a, b, c, d) {
  const n = Math.max(12, Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z) + Math.hypot(d.x - c.x, d.z - c.z)) / 4));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return point3(
      u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      (a.y ?? 0) + ((d.y ?? 0) - (a.y ?? 0)) * ease(t),
      u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z
    );
  });
}
var arc = (x, z, r, start, sweep) => {
  const n = Math.ceil(Math.abs(sweep) * r / 3);
  return Array.from({ length: n + 1 }, (_, i) => point3(x + r * Math.cos(start + sweep * i / n), 0, z + r * Math.sin(start + sweep * i / n)));
};
var join = (...paths) => paths.flatMap((p, i) => i ? p.slice(1) : p);
var line = (a, b) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
  return Array.from({ length: n + 1 }, (_, i) => point3(a.x + (b.x - a.x) * i / n, (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * i / n, a.z + (b.z - a.z) * i / n));
};
function expandBackbonePreset(id, p) {
  const designProfile = p.designProfile ?? (id === "peripheral_motorway_junction" ? "motorway" : id === "urban_side_access" ? "urban" : void 0);
  const m = newCityMap(), groupId = p.groupId ?? id, meta = { groupId, presetSource: id, designProfile };
  const compact = designProfile === "urban";
  const position = p.position ?? point3(0, 0, 0), rotation = p.rotation ?? 0;
  const lanes = p.mainRoadLanes ?? 6, crossLanes = p.crossRoadLanes ?? 6, mainY = p.mainElevation ?? 8, crossY = p.crossElevation ?? 0;
  const radius = Math.max(compact ? 30 : id === "peripheral_motorway_junction" ? 50 : 45, p.rampRadius ?? (compact ? 35 : 60)), length = p.length ?? (id === "urban_underpass" ? 110 : id === "urban_main_aux" ? 1800 : id === "urban_side_access" ? 900 : 550);
  const mainApproach = p.mainApproach ?? (compact ? 420 : 600), crossApproach = p.crossApproach ?? (compact ? 420 : 600), cdOffset = compact ? 14 : 22, mouth = compact ? 65 : 125, lead = compact ? 100 : designProfile === "motorway" ? 220 : 150;
  if (p.designProfile !== void 0 && !["urban", "motorway"].includes(p.designProfile) || ![mainApproach, crossApproach].every((v) => Number.isFinite(v) && v >= 300 && v <= 1e3) || compact && radius > 45) throw new Error("preset.parameters: invalid expressway design profile");
  if (![4, 6].includes(lanes) || ![4, 6].includes(crossLanes) || !Number.isFinite(radius) || radius > 100 || !Number.isFinite(length) || length < 80 || length > 3e3 || ![position.x, position.y ?? 0, position.z, rotation, mainY, crossY].every(Number.isFinite)) throw new Error("preset.parameters: invalid backbone dimensions");
  if (p.profileInterpolation !== void 0 && p.profileInterpolation !== "smooth" && p.profileInterpolation !== "linear") throw new Error("preset.parameters: invalid profile interpolation");
  for (const profile of [p.mainProfile, p.crossProfile]) if (profile && (profile.length < 2 || profile.some((q, i) => !Number.isFinite(q.offset) || !Number.isFinite(q.height) || i > 0 && q.offset <= profile[i - 1].offset))) throw new Error("preset.parameters: ordered finite height profile required");
  const endpoint2 = (r, end) => ({ roadId: r.id, end });
  const link = (a, b) => connectRoads(m, a, b, { id: `${groupId}:link-${m.roadLinks.length}` });
  const port = (label, e) => m.connectionPorts.push({ id: `${groupId}:port-${m.connectionPorts.length}`, label, endpoint: e, groupId });
  const road = (label, points, count = 1, speed = 45, urban = false) => {
    const r = { id: `${groupId}:${label}`, ...meta, type: "highway", centerline: [], laneCount: count, laneWidth: 3.9, travelDirection: "forward", speedLimit: speed };
    applyRoadStyle(r, urban ? "urban_boulevard_6" : "ramp_1");
    Object.assign(r, {
      type: urban ? "urban_6lane" : "highway",
      centerline: points,
      laneCount: count,
      laneWidth: urban ? 3.75 : count === 3 ? 3.75 : 3.9,
      travelDirection: urban ? "two-way" : "forward",
      speedLimit: speed,
      elevationMode: "custom",
      streetlights: false
    });
    r.roadClass = urban ? "arterial" : count >= 3 ? "expressway" : count === 2 ? "connector" : "ramp";
    r.crossSection = urban ? "boulevard" : "shouldered";
    r.structure = { barrierEnabled: !urban, piersEnabled: true, pierSpacing: 55, barrierOffset: 0.25 };
    if (!urban) r.shoulders = { left: 0.75, right: 1.75 };
    m.roads.push(r);
    return r;
  };
  const bm = lanes / 2 * 3.75 / 2 + 2.5, bc = p.crossCarriagewayOffset ?? crossLanes / 2 * 3.75 / 2 + 2.5;
  if (!Number.isFinite(bc) || bc < 6 || bc > 30) throw new Error("preset.parameters: invalid cross carriageway separation");
  const mainHeight = (offset) => profileHeight(p.mainProfile, offset, mainY, p.profileInterpolation);
  const crossHeight = (offset) => profileHeight(p.crossProfile, offset, crossY, p.profileInterpolation);
  if (SYSTEMS.includes(id)) {
    const collector = id.endsWith("_cd") ? p.collectorAxis ?? (id === "system_parclo_cd" ? "cross" : "main") : void 0;
    const sideOffset = (axis) => (axis === "main" ? bm : bc) + (collector === axis ? cdOffset : 0);
    const height = (q) => Math.abs(q.x) < Math.abs(q.z) ? mainHeight(q.z) : crossHeight(q.x);
    const drape = (path, entry, exit) => {
      const length2 = polylineLength(path), from = entry, to = length2 - exit, span = to - from;
      const at = (distance2) => height(sampleAt(path, distance2).point);
      const a = at(from), b = at(to), ga = (at(from + 1) - at(from - 1)) / 2, gb = (at(to + 1) - at(to - 1)) / 2;
      let d = 0;
      path.forEach((q, i) => {
        if (i) d += Math.hypot(q.x - path[i - 1].x, q.z - path[i - 1].z);
        const t = (d - from) / span;
        q.y = d <= from || d >= to ? at(d) : (2 * t * t * t - 3 * t * t + 1) * a + (t * t * t - 2 * t * t + t) * ga * span + (-2 * t * t * t + 3 * t * t) * b + (t * t * t - t * t) * gb * span;
      });
    };
    const nodes = /* @__PURE__ */ new Map();
    const key = (q) => `${q.x.toFixed(3)},${q.z.toFixed(3)}`;
    if (id === "system_cloverstack_lite" || id === "system_parclo_cd") for (const sign of [1, -1]) {
      const distance2 = compact ? 550 : mainApproach;
      const a = point3(sign * bm, mainHeight(sign * (distance2 + 50)), sign * (distance2 + 50)), b = point3(sign * bm, mainHeight(sign * distance2), sign * distance2);
      const r = road(`feeder-${sign}`, line(a, b), lanes / 2, 80);
      r.styleId = "highway_6";
      nodes.set(key(b), { incoming: endpoint2(r, "end") });
      port("Mainline In", endpoint2(r, "start"));
      port("Mainline Out", endpoint2(r, "end"));
      if (compact) {
        const c = point3(sign * 420, crossHeight(sign * 420), sign * bc), d = point3(sign * 470, crossHeight(sign * 470), sign * bc);
        const feeder = road(`feeder-cross-${sign}`, line(c, d), crossLanes / 2, 80);
        feeder.styleId = "highway_6";
        nodes.set(key(c), { incoming: endpoint2(feeder, "start"), outgoing: endpoint2(feeder, "start") });
        port("Crossline In", endpoint2(feeder, "start"));
        port("Crossline Out", endpoint2(feeder, "end"));
      }
    }
    if (collector) for (const sign of [1, -1]) {
      const b = collector === "main" ? bm : bc, offsets = (compact ? [300, 190, mouth, -mouth, -190, -300] : [450, 350, mouth, -mouth, -350, -450]).map((t) => t * sign);
      const values = collector === "main" ? offsets : offsets.map((v) => -v);
      let previous;
      for (let i = 1; i < values.length; i++) {
        const a = values[i - 1], z = values[i], side = b + cdOffset;
        const point = (v, offset) => collector === "main" ? point3(sign * offset, mainHeight(v), v) : point3(v, crossHeight(v), sign * offset);
        const start = point(a, i === 1 ? b : side), finish = point(z, i === values.length - 1 ? b : side);
        const points = i === 1 || i === values.length - 1 ? bezierPoints(start, point(a + (z - a) / 3, i === 1 ? b : side), point(a + 2 * (z - a) / 3, i === values.length - 1 ? b : side), finish) : line(start, finish);
        const r = road(`collector-${sign}-${i}`, points, 2, 70);
        r.styleId = "collector_distributor_2";
        if (previous) {
          link(endpoint2(previous, "end"), endpoint2(r, "start"));
          nodes.set(key(start), { incoming: endpoint2(previous, "end"), outgoing: endpoint2(r, "start") });
        } else port("Collector In", endpoint2(r, "start"));
        if (i === values.length - 1) port("Collector Out", endpoint2(r, "end"));
        previous = r;
      }
    }
    const attach = (r) => {
      for (const end of ["start", "end"]) {
        const q = end === "start" ? r.centerline[0] : r.centerline.at(-1), node = nodes.get(key(q));
        if (node && (end === "start" || node.outgoing)) link(end === "start" ? node.incoming : endpoint2(r, "end"), end === "start" ? endpoint2(r, "start") : node.outgoing);
        else port(`${r.id.split(":").at(-1)} ${end === "start" ? "In" : "Out"}`, endpoint2(r, end));
      }
    };
    const leftNames = ["S-to-W", "E-to-S", "N-to-E", "W-to-N"], rightNames = ["S-to-E", "E-to-N", "N-to-W", "W-to-S"];
    for (let q = 0; q < 4; q++) {
      const rot = q * Math.PI / 2, sourceAxis = q % 2 ? "cross" : "main", destAxis = q % 2 ? "main" : "cross";
      const bs = sideOffset(sourceAxis), bd = sideOffset(destAxis), box = mouth + lead + radius + (compact ? 15 : 30);
      const start = point3(bs, 0, -mouth), a = point3(bs + 10, 0, -mouth - lead);
      const tail = point3(mouth + lead, 0, -bd - 10), finish = point3(mouth, 0, -bd);
      const handle = compact ? 30 : 35;
      const path = join(
        bezierPoints(start, point3(bs, 0, -mouth - handle), point3(bs + 10, 0, -mouth - lead + handle), a),
        line(a, point3(bs + 10, 0, -box + radius)),
        arc(bs + 10 + radius, -box + radius, radius, Math.PI, Math.PI / 2),
        line(point3(bs + 10 + radius, 0, -box), point3(box - radius, 0, -box)),
        arc(box - radius, -box + radius, radius, -Math.PI / 2, Math.PI / 2),
        line(point3(box, 0, -box + radius), point3(box, 0, -bd - 10 - radius)),
        arc(box - radius, -bd - 10 - radius, radius, 0, Math.PI / 2),
        line(point3(box - radius, 0, -bd - 10), tail),
        bezierPoints(tail, point3(mouth + lead - handle, 0, -bd - 10), point3(mouth + handle, 0, -bd), finish)
      ).map((v) => rotatePoint(v, rot));
      drape(path, lead, lead);
      if (id === "peripheral_motorway_junction" && q === 2) {
        const startY = height(path[0]), endY = height(path.at(-1)), total = polylineLength(path), fall = Math.abs(endY - startY) * 1.875 / 0.06, exit = 80;
        let d = 0;
        path.forEach((v, i) => {
          if (i) d += Math.hypot(v.x - path[i - 1].x, v.z - path[i - 1].z);
          v.y = startY + (endY - startY) * ease((d - (total - exit - fall)) / fall);
        });
      }
      const directional = (id === "system_cloverstack_lite" || id === "system_parclo_cd") && q % 2 === 0;
      if (id !== "peripheral_motorway_junction" || q === 1 || q === 2) {
        if (directional) {
          if (compact) {
            const sy = height(rotatePoint(point3(bm, 0, 550), rot)), ey = height(rotatePoint(point3(-420, 0, -bc), rot)), peak = Math.max(mainY, crossY) + 6;
            const entrance = bezierPoints(point3(bm, sy, 550), point3(bm, sy, 480), point3(82, sy, 430), point3(82, sy, 300));
            const rise = join(entrance, line(point3(82, sy, 300), point3(82, peak, -330)));
            let d = 0;
            const run = Math.max(300, (peak - sy) * 1.875 / 0.06);
            rise.forEach((v, i) => {
              if (i) d += Math.hypot(v.x - rise[i - 1].x, v.z - rise[i - 1].z);
              v.y = d <= 100 ? sy : sy + (peak - sy) * ease((d - 100) / run);
            });
            const turn2 = arc(12, -330, 70, 0, -Math.PI / 2).map((v) => ({ ...v, y: peak }));
            const merge = bezierPoints(point3(-150, peak, -400), point3(-340, peak, -400), point3(-260, ey, -bc), point3(-420, ey, -bc));
            const mergeLength = polylineLength(merge), fall = Math.max(200, (peak - ey) * 1.875 / 0.06);
            let md = 0;
            merge.forEach((v, i) => {
              if (i) md += Math.hypot(v.x - merge[i - 1].x, v.z - merge[i - 1].z);
              v.y = peak + (ey - peak) * ease((md - (mergeLength - fall)) / fall);
            });
            const r2 = road(`${leftNames[q]}-${id === "system_parclo_cd" ? "crossover" : "semi"}`, join(rise, turn2, line(point3(12, peak, -400), point3(-150, peak, -400)), merge).map((v) => rotatePoint(v, rot)), 1, 50);
            r2.gore = { start: true, end: true, length: 120 };
            attach(r2);
          } else {
            const sy = height(rotatePoint(point3(bm, 0, 600), rot)), ey = height(rotatePoint(point3(-850, 0, -bc), rot)), peak = Math.max(mainY, crossY) + 8;
            const rise = join(bezierPoints(point3(bm, sy, 600), point3(bm, sy, 500), point3(150, peak, 400), point3(150, peak, 300)), line(point3(150, peak, 300), point3(150, peak, -380)));
            let riseDistance = 0;
            const verticalRun = Math.max(350, (peak - sy) * 1.875 / 0.06);
            rise.forEach((v, i) => {
              if (i) riseDistance += Math.hypot(v.x - rise[i - 1].x, v.z - rise[i - 1].z);
              v.y = sy + (peak - sy) * ease(riseDistance / verticalRun);
            });
            const turn2 = arc(30, -380, 120, 0, -Math.PI / 2).map((v) => ({ ...v, y: peak }));
            const transverse = line(point3(30, peak, -500), point3(-300, peak, -500));
            const merge = bezierPoints(point3(-300, peak, -500), point3(-500, peak, -500), point3(-650, ey, -bc), point3(-850, ey, -bc));
            const r2 = road(`${leftNames[q]}-${id === "system_parclo_cd" ? "crossover" : "semi"}`, join(rise, turn2, transverse, merge).map((v) => rotatePoint(v, rot)), 1, 60);
            r2.gore = { start: true, end: true, length: 180 };
            attach(r2);
          }
        } else {
          const r2 = road(`${leftNames[q]}-loop`, path, 1, compact ? 35 : 45);
          r2.gore = { start: true, end: true, length: compact ? 100 : id === "peripheral_motorway_junction" ? 200 : 150 };
          attach(r2);
        }
      }
      if (id === "peripheral_motorway_junction" && q !== 0 && q !== 1) continue;
      const rb = sourceAxis === "main" ? bm : bc, db = destAxis === "main" ? bm : bc;
      const source2 = sourceAxis === "main" ? mainApproach : crossApproach, dest = destAxis === "main" ? mainApproach : crossApproach, entry = compact ? 120 : 150, rr = compact ? 55 : 70, cornerZ = source2 - entry, tailX = dest - 200;
      const outer = (id === "peripheral_motorway_junction" ? bezierPoints(point3(rb, 0, source2), point3(rb, 0, source2 * 0.45), point3(dest * 0.45, 0, db), point3(dest, 0, db)) : join(
        bezierPoints(point3(rb, 0, source2), point3(rb, 0, source2 - entry / 3), point3(rb + 10, 0, source2 - entry * 2 / 3), point3(rb + 10, 0, cornerZ)),
        arc(rb + 10 + rr, cornerZ, rr, Math.PI, Math.PI / 2),
        line(point3(rb + 10 + rr, 0, cornerZ - rr), point3(tailX, 0, cornerZ - rr)),
        bezierPoints(point3(tailX, 0, cornerZ - rr), point3(tailX + 160, 0, cornerZ - rr), point3(dest - 160, 0, db), point3(dest, 0, db))
      )).map((v) => rotatePoint(v, rot));
      drape(outer, entry, compact ? 140 : 180);
      const r = road(`${rightNames[q]}-right`, outer, 1, compact ? 50 : 55);
      r.gore = { start: true, end: true, length: compact ? 120 : id === "peripheral_motorway_junction" ? 220 : 180 };
      attach(r);
    }
  } else if (id === "urban_side_access") {
    for (const sign of [1, -1]) {
      const side = sign * (bm + 30), cuts = [length / 2, 100, 0, -100, -length / 2].sort((a, b) => b - a);
      let previous;
      const nodes = /* @__PURE__ */ new Map();
      for (let i = 1; i < cuts.length; i++) {
        const r = road(`frontage-${sign}-${i}`, line(point3(side, 0, sign * cuts[i - 1]), point3(side, 0, sign * cuts[i])), 2, 40);
        r.styleId = "urban_auxiliary_2";
        r.laneWidth = 3.75;
        r.shoulders = { left: 0, right: 0 };
        r.sidewalk = { enabled: true, width: 3 };
        r.curb = true;
        r.structure.barrierEnabled = false;
        if (previous) {
          link(endpoint2(previous, "end"), endpoint2(r, "start"));
          nodes.set(cuts[i - 1], { incoming: endpoint2(previous, "end"), outgoing: endpoint2(r, "start") });
        } else port("Frontage In", endpoint2(r, "start"));
        if (i === cuts.length - 1) port("Frontage Out", endpoint2(r, "end"));
        previous = r;
      }
      for (const on of [false, true]) {
        const a = on ? point3(side, 0, 0) : point3(sign * bm, mainHeight(sign * 300), sign * 300), b = on ? point3(sign * bm, mainHeight(-sign * 300), -sign * 300) : point3(side, 0, 0);
        const r = road(`${on ? "on" : "off"}-${sign}`, bezierPoints(a, point3(a.x, a.y ?? 0, a.z - sign * 100), point3(b.x, b.y ?? 0, b.z + sign * 100), b), 1, 45);
        r.designProfile = "urban";
        r.gore = { start: true, end: true, length: on ? 120 : 100 };
        link(on ? nodes.get(0).incoming : endpoint2(r, "end"), on ? endpoint2(r, "start") : nodes.get(0).outgoing);
        port(on ? "Expressway On" : "Expressway Off", endpoint2(r, on ? "end" : "start"));
      }
    }
  } else if (id === "divided_tunnel" || id === "urban_underpass") {
    for (const sign of id === "divided_tunnel" ? [1, -1] : [0]) {
      const r = road(sign === 0 ? "underpass" : sign > 0 ? "northbound" : "southbound", line(point3(sign * bm, 0, sign < 0 ? -length / 2 : length / 2), point3(sign * bm, 0, sign < 0 ? length / 2 : -length / 2)), sign === 0 ? 6 : lanes / 2, sign === 0 ? 40 : 80, sign === 0);
      r.structure.enclosure = { kind: sign === 0 ? "underpass" : "tunnel", clearance: 6 };
      r.structure.piersEnabled = false;
      r.structure.barrierEnabled = false;
      if (sign !== 0) r.styleId = "highway_6";
      port(sign < 0 ? "North In" : "South In", endpoint2(r, "start"));
      port(sign < 0 ? "South Out" : "North Out", endpoint2(r, "end"));
    }
  } else if (id === "urban_main_aux") {
    for (const sign of [1, -1]) {
      const positions = [length / 2, ...[600, 400, 0, -200, -600, -800].filter((z) => Math.abs(z) < length / 2), -length / 2].sort((a, b) => b - a);
      const mainNodes = /* @__PURE__ */ new Map(), auxNodes = /* @__PURE__ */ new Map();
      for (const [label, side, count, nodes] of [["main", sign * bm, 3, mainNodes], ["frontage", sign * 32, 2, auxNodes]]) {
        let previous;
        for (let i = 1; i < positions.length; i++) {
          const r = road(`${label}-${sign}-${i}`, line(point3(side, 0, sign * positions[i - 1]), point3(side, 0, sign * positions[i])), count, label === "main" ? 60 : 40);
          r.styleId = label === "main" ? "urban_boulevard_6" : "urban_auxiliary_2";
          if (label === "frontage") {
            r.structure.barrierEnabled = false;
            r.shoulders = { left: 0, right: 0 };
            r.sidewalk = { enabled: true, width: 3 };
            r.curb = true;
          }
          if (previous) {
            link(endpoint2(previous, "end"), endpoint2(r, "start"));
            nodes.set(positions[i - 1], { incoming: endpoint2(previous, "end"), outgoing: endpoint2(r, "start") });
          } else port(label === "main" ? "Main In" : "Frontage In", endpoint2(r, "start"));
          if (i === positions.length - 1) port(label === "main" ? "Main Out" : "Frontage Out", endpoint2(r, "end"));
          previous = r;
        }
      }
      for (const [at, to, exit] of [[600, 400, true], [0, -200, false], [-600, -800, true]]) {
        const source2 = exit ? mainNodes : auxNodes, dest = exit ? auxNodes : mainNodes;
        if (!source2.has(at) || !dest.has(to)) continue;
        const a = point3(sign * (exit ? bm : 32), 0, sign * at), b = point3(sign * (exit ? 32 : bm), 0, sign * to);
        const r = road(`transition-${sign}-${at}`, bezierPoints(a, point3(a.x, 0, a.z - sign * 70), point3(b.x, 0, b.z + sign * 70), b), 1, 35);
        r.structure.barrierEnabled = false;
        r.gore = { start: true, end: true, length: 150 };
        link(source2.get(at).incoming, endpoint2(r, "start"));
        link(endpoint2(r, "end"), dest.get(to).outgoing);
      }
    }
  }
  m.roads.forEach((r) => r.centerline = r.centerline.map((v) => transformPoint3(v, position, rotation)));
  refreshPortPoses(m);
  for (const port2 of m.connectionPorts) port2.label = directionalPortLabel(port2.label, port2.heading ?? 0);
  const report = validateMap(m);
  if (!report.valid) throw new Error(`preset.output ${id}: ${JSON.stringify(report.errors)}`);
  const issues = validatePresetGeometry(m);
  if (issues.length) throw new Error(`preset.geometry ${id}: ${JSON.stringify(issues)}`);
  return { ...m, groupId, roadLinks: m.roadLinks, connectionPorts: m.connectionPorts };
}

// src/world/city/presets/CompactInterchangePresets.ts
var COMPACT_INTERCHANGE_IDS = ["system_compact_x", "system_compact_turbine", "system_compact_star", "system_compact_cloverleaf", "system_compact_hybrid"];
var compactRampEase = (t, blend2 = 0.035) => {
  t = Math.max(0, Math.min(1, t));
  return t < blend2 ? t * t / (2 * blend2 * (1 - blend2)) : t > 1 - blend2 ? 1 - (1 - t) * (1 - t) / (2 * blend2 * (1 - blend2)) : (t - blend2 / 2) / (1 - blend2);
};
var join2 = (...paths) => paths.flatMap((p, i) => i ? p.slice(1) : p);
var line2 = (a, b) => {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
  return Array.from({ length: n + 1 }, (_, i) => point3(a.x + (b.x - a.x) * i / n, 0, a.z + (b.z - a.z) * i / n));
};
var arc2 = (x, z, r, angle, sweep) => {
  const n = Math.ceil(Math.abs(sweep) * r / 2);
  return Array.from({ length: n + 1 }, (_, i) => point3(x + r * Math.cos(angle + sweep * i / n), 0, z + r * Math.sin(angle + sweep * i / n)));
};
function crossingDistance(a, b) {
  const result = [];
  let distance2 = 0;
  for (let i = 1; i < a.length; i++) {
    const aa = a[i - 1], ab = a[i], dx = ab.x - aa.x, dz = ab.z - aa.z, l = Math.hypot(dx, dz);
    for (let j = 1; j < b.length; j++) {
      const ba = b[j - 1], bb = b[j], ex = bb.x - ba.x, ez = bb.z - ba.z, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-8) continue;
      const t = ((ba.x - aa.x) * ez - (ba.z - aa.z) * ex) / den, u = ((ba.x - aa.x) * dz - (ba.z - aa.z) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) result.push(distance2 + t * l);
    }
    distance2 += l;
  }
  return result;
}
function expandCompactInterchange(id, p = {}) {
  const map = newCityMap(), groupId = p.groupId ?? id, mainY = p.mainElevation ?? 0, crossY = p.crossElevation ?? 8;
  const bm = (p.mainRoadLanes ?? 6) / 2 * 3.75 / 2 + 2.5, bc = (p.crossRoadLanes ?? 6) / 2 * 3.75 / 2 + 2.5;
  const radius = Math.min(40, Math.max(38, p.rampRadius ?? 38)), delta = Math.abs(mainY - crossY), approach = p.mainApproach ?? (id === "system_compact_star" ? 370 : 330) + Math.max(0, delta - 8) * 20;
  if (!COMPACT_INTERCHANGE_IDS.includes(id) || ![mainY, crossY, bm, bc, radius, approach].every(Number.isFinite) || approach < 240 || approach > 600) throw new Error("preset.parameters: invalid compact system dimensions");
  if (p.rightApproach !== void 0 && (!Number.isFinite(p.rightApproach) || p.rightApproach < 160 || p.rightApproach > 400)) throw new Error("preset.parameters: rightApproach must be 160\u2013400m");
  const main = (offset) => profileHeight(p.mainProfile, offset, mainY, p.profileInterpolation), cross = (offset) => profileHeight(p.crossProfile, offset, crossY, p.profileInterpolation);
  const height = (q) => Math.abs(q.x) < Math.abs(q.z) ? main(q.z) : cross(q.x);
  const port = (label, r, end) => map.connectionPorts.push({ id: `${r.id}:port-${end}`, label, endpoint: { roadId: r.id, end }, groupId, position: r.centerline[end === "start" ? 0 : r.centerline.length - 1], heading: 0 });
  const road = (movement, path, speed) => {
    const r = { id: `${groupId}:${movement}`, groupId, presetSource: id, designProfile: "urban", type: "ramp_1", roadClass: "ramp", crossSection: "shouldered", styleId: "ramp_1", centerline: path, laneCount: 1, laneWidth: 3.9, travelDirection: "forward", speedLimit: speed, elevationMode: "custom", shoulders: { left: 0.75, right: 1.75 }, structure: { barrierEnabled: true, piersEnabled: true, pierSpacing: 45, barrierOffset: 0.25 }, gore: { start: true, end: true, length: 100 } };
    map.roads.push(r);
    port("Movement In", r, "start");
    port("Movement Out", r, "end");
    return r;
  };
  const leftNames = ["S-to-W", "E-to-S", "N-to-E", "W-to-N"], rightNames = ["S-to-E", "E-to-N", "N-to-W", "W-to-S"];
  const semi = [];
  for (let q = 0; q < 4; q++) {
    const rot = q * Math.PI / 2, sourceB = q % 2 ? bc : bm, destB = q % 2 ? bm : bc;
    const loop = id === "system_compact_cloverleaf" || id === "system_compact_hybrid" && q % 2 === 1;
    if (loop) {
      const path2 = arc2(sourceB + radius, -destB - radius, radius, Math.PI, Math.PI * 1.5).map((v) => rotatePoint(v, rot)), len2 = polylineLength(path2), sy2 = height(path2[0]), ey2 = height(path2.at(-1));
      let d2 = 0;
      for (let i = 0; i < path2.length; i++) {
        if (i) d2 += Math.hypot(path2[i].x - path2[i - 1].x, path2[i].z - path2[i - 1].z);
        path2[i].y = sy2 + (ey2 - sy2) * compactRampEase((d2 - 25) / (len2 - 38));
      }
      road(`${leftNames[q]}-loop`, path2, 35);
    } else {
      let entrance, core, merge;
      if (id === "system_compact_turbine") {
        entrance = bezierPoints(point3(sourceB, 0, approach), point3(sourceB, 0, approach - 90), point3(80, 0, 105), point3(80, 0, 15));
        core = join2(arc2(0, 15, 80, 0, -Math.PI / 2), line2(point3(0, 0, -65), point3(-130, 0, -65)));
      } else if (id === "system_compact_star") {
        entrance = bezierPoints(point3(sourceB, 0, approach), point3(sourceB, 0, approach - 70), point3(50, 0, 210), point3(50, 0, 120));
        core = bezierPoints(point3(50, 0, 120), point3(50, 0, 50), point3(-50, 0, -50), point3(-120, 0, -50));
      } else {
        entrance = bezierPoints(point3(sourceB, 0, approach), point3(sourceB, 0, approach - 90), point3(50, 0, 200), point3(50, 0, 110));
        core = bezierPoints(point3(50, 0, 110), point3(50, 0, 45), point3(-45, 0, -50), point3(-110, 0, -50));
      }
      const end = core.at(-1);
      merge = bezierPoints(end, point3(end.x - 80, 0, end.z), point3(-approach + 80, 0, -destB), point3(-approach, 0, -destB));
      const r = road(`${leftNames[q]}-${id === "system_compact_turbine" ? "turbine" : id === "system_compact_star" ? "star" : "semi"}`, join2(entrance, core, merge).map((v) => rotatePoint(v, rot)), 45);
      r.gore.length = 120;
      semi.push({ r, q });
    }
    const rightApproach = p.rightApproach ?? (id === "system_compact_cloverleaf" || id === "system_compact_hybrid" ? 270 : 160);
    const a = rightApproach, path = bezierPoints(point3(sourceB, 0, a), point3(sourceB, 0, a * 0.45), point3(a * 0.45, 0, destB), point3(a, 0, destB)).map((v) => rotatePoint(v, rot));
    const len = polylineLength(path), sy = height(path[0]), ey = height(path.at(-1));
    let d = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      path[i].y = sy + (ey - sy) * compactRampEase((d - 55) / (len - 110));
    }
    road(`${rightNames[q]}-right`, path, 45);
  }
  for (const { r, q } of semi) {
    const path = r.centerline, len = polylineLength(path), events = semi.filter((other) => other.q % 2 !== q % 2).flatMap((other) => crossingDistance(path, other.r.centerline));
    const sy = height(path[0]), ey = height(path.at(-1)), sourceHigh = mainY === crossY ? q % 2 === 0 : (q % 2 ? crossY : mainY) > (q % 2 ? mainY : crossY), peak = Math.max(mainY, crossY) + (id === "system_compact_hybrid" || sourceHigh ? 6 : 12);
    const first = events.length ? Math.min(...events) - 8 : len * 0.43, last = events.length ? Math.max(...events) + 12 : len * 0.62;
    const same = semi.filter((other) => other.q !== q && other.q % 2 === q % 2).flatMap((other) => crossingDistance(path, other.r.centerline));
    const early = same.length ? Math.min(...same) + 10 : void 0, late = same.length ? Math.max(...same) + 10 : void 0;
    const knots = [[35, sy], ...early !== void 0 && early < first ? [[early, peak - 6]] : [], [first, peak], [last, peak], ...late !== void 0 && late > last ? [[late, peak]] : [], [len - 35, ey]];
    let d = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      const k2 = knots.findIndex((k3) => k3[0] >= d);
      if (k2 === 0) path[i].y = sy;
      else if (k2 < 0) path[i].y = ey;
      else {
        const a = knots[k2 - 1], b = knots[k2];
        path[i].y = a[1] + (b[1] - a[1]) * compactRampEase((d - a[0]) / (b[0] - a[0]));
      }
    }
  }
  for (const r of map.roads) r.centerline = r.centerline.map((q) => transformPoint3(q, p.position ?? point3(0, 0, 0), p.rotation ?? 0));
  for (const port2 of map.connectionPorts) port2.position = map.roads.find((r) => r.id === port2.endpoint.roadId).centerline[port2.endpoint.end === "start" ? 0 : map.roads.find((r) => r.id === port2.endpoint.roadId).centerline.length - 1];
  refreshPortPoses(map);
  return { ...map, roadLinks: map.roadLinks, connectionPorts: map.connectionPorts, groupId };
}

// src/world/city/presets/InfrastructurePresets.ts
var PRESET_CATALOG = catalog_default.presets;
function expandPreset(id, parameters = {}) {
  const descriptor = catalog_default.presets.find((p) => p.id === id);
  if (!descriptor)
    throw new Error(`preset.unknown: ${id}`);
  if (COMPACT_INTERCHANGE_IDS.includes(id)) {
    const stamp = expandCompactInterchange(id, parameters), map = { ...newCityMap(), ...stamp }, issues = validatePresetGeometry(map);
    if (issues.length) throw new Error(`preset.geometry ${id}: ${JSON.stringify(issues)}`);
    return stamp;
  }
  if (isBackbonePreset(id)) return expandBackbonePreset(id, parameters);
  const lanes = parameters.mainRoadLanes ?? 6, cross = parameters.crossRoadLanes ?? 4, height = parameters.mainElevation ?? 8, rampLanes = parameters.rampLaneCount ?? 1, radius = parameters.rampRadius ?? 100;
  if (![4, 6].includes(lanes) || ![4, 6].includes(cross) || ![1, 2].includes(rampLanes) || !Number.isFinite(height) || height < 5 || height > 12 || !Number.isFinite(radius) || radius < 40 || radius > 100)
    throw new Error("preset.parameters: lanes 4/6, ramp lanes 1/2, elevation 5\u201312m, radius 40\u2013100m required.");
  const loopRadius = Math.max(80, radius);
  const position = parameters.position ?? { x: 0, y: 0, z: 0 }, rotation = parameters.rotation ?? 0;
  if (![position.x, position.y ?? 0, position.z, rotation].every(Number.isFinite))
    throw new Error("preset.transform: finite position/rotation required.");
  const groupId = parameters.groupId ?? id;
  const m = newCityMap(), meta = { groupId, presetSource: id };
  const ids = new CityMapIds();
  const name = (label) => ids.allocate(`${groupId}:${label}`);
  const end = (r, e) => ({ roadId: r.id, end: e });
  const link = (from, to) => connectRoads(m, from, to, { id: name("link") });
  const port = (label, endpoint2) => m.connectionPorts.push({ id: name("port"), label, endpoint: endpoint2, groupId });
  const road = (label, points, laneCount = lanes, oneWay = false, ramp2 = false) => {
    const authoredPoints = points.map((p) => ({ ...p }));
    const r = { id: name(label), ...meta, type: "highway", centerline: points, laneCount, laneWidth: 3.75, speedLimit: ramp2 ? 40 : 80, travelDirection: oneWay ? "forward" : "two-way" };
    applyRoadStyle(r, ramp2 ? "ramp_1" : "highway_6");
    r.type = laneCount === 1 ? "ramp_1" : "highway";
    r.roadClass = ramp2 ? "ramp" : "expressway";
    r.crossSection = "shouldered";
    r.laneCount = laneCount;
    r.travelDirection = oneWay ? "forward" : "two-way";
    r.speedLimit = ramp2 ? 40 : 80;
    if (!ramp2) {
      r.shoulders = { left: 0.75, right: 1.75 };
      r.structure.barrierOffset = 0.25;
    }
    r.elevationMode = "custom";
    r.centerline = authoredPoints;
    r.streetlights = false;
    m.roads.push(r);
    return r;
  };
  const makeRoad = (label, points, laneCount = lanes, oneWay = false, ramp2 = false) => road(label, points.map((p) => ({ ...p })), laneCount, oneWay, ramp2);
  const arc3 = (cx, cz, rx, rz, a, sweep, y0, y1) => {
    const count = Math.max(12, Math.ceil(Math.abs(sweep) * Math.max(rx, rz) / 3));
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count, angle = a + sweep * t, u = Math.max(0, Math.min(1, (t - 0.2) / 0.6)), blend2 = u * u * (3 - 2 * u);
      return point3(cx + rx * Math.cos(angle), y0 + (y1 - y0) * blend2, cz + rz * Math.sin(angle));
    });
  };
  const nodeKey = (p) => `${p.x.toFixed(4)},${p.z.toFixed(4)},${(p.y ?? 0).toFixed(4)}`;
  const nodes = /* @__PURE__ */ new Map();
  const chain = (label, points, count, startLabel, endLabel) => {
    let previous;
    for (let i = 1; i < points.length; i++) {
      const r = makeRoad(label, [points[i - 1], points[i]], count, true);
      const start = nodes.get(nodeKey(points[i - 1])) ?? {};
      start.outgoing = end(r, "start");
      nodes.set(nodeKey(points[i - 1]), start);
      const finish = nodes.get(nodeKey(points[i])) ?? {};
      finish.incoming = end(r, "end");
      nodes.set(nodeKey(points[i]), finish);
      if (previous)
        link(end(previous, "end"), end(r, "start"));
      else if (startLabel)
        port(startLabel, end(r, "start"));
      if (i === points.length - 1 && endLabel)
        port(endLabel, end(r, "end"));
      previous = r;
    }
  };
  const ramp = (label, points) => {
    const r = makeRoad(label, points, rampLanes, true, true);
    const a = nodes.get(nodeKey(points[0])), b = nodes.get(nodeKey(points.at(-1)));
    r.gore = { start: !!a, end: !!b, length: 140 };
    if (a?.incoming)
      link(a.incoming, end(r, "start"));
    if (b?.outgoing)
      link(end(r, "end"), b.outgoing);
    return r;
  };
  const A = loopRadius * 7 + 120, L = A + 200, bm = lanes / 2 * 3.75 / 2 + 2.5, bc = cross / 2 * 3.75 / 2 + 2.5;
  const urban = (label, points, count) => {
    const r = makeRoad(label, points, count);
    r.type = count === 6 ? "urban_6lane" : count === 4 ? "urban_4lane" : "urban_2lane";
    r.styleId = count === 6 ? "urban_boulevard_6" : count === 4 ? "urban_street_4" : "urban_local_2";
    r.laneWidth = count === 6 ? 3.75 : 3.6;
    r.shoulders = void 0;
    r.sidewalk = { enabled: true, width: 3 };
    r.curb = true;
    r.streetlights = false;
    r.structure.barrierEnabled = false;
    r.speedLimit = 50;
    return r;
  };
  const bezier = (a, b, c, d) => {
    const count = Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z) + Math.hypot(d.x - c.x, d.z - c.z)) / 3);
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count, u = 1 - t, v = Math.max(0, Math.min(1, (t - 0.2) / 0.6)), blend2 = v * v * (3 - 2 * v);
      return point3(
        u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
        (a.y ?? 0) + ((d.y ?? 0) - (a.y ?? 0)) * blend2,
        u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z
      );
    });
  };
  if (id.startsWith("signal_cross_") || id.startsWith("t_")) {
    const t = id.startsWith("t_"), mainCount = id.includes("6x") ? 6 : 4, sideCount = id.endsWith("x2") ? 2 : id.endsWith("x6") ? 6 : 4;
    const j = {
      id: name("junction"),
      ...meta,
      type: t ? "t_4lane" : mainCount === 6 ? "cross_6lane" : "cross_4lane",
      position: point3(0, 0, 0),
      rotation: 0,
      connections: [],
      signalized: true,
      signals: { headHeight: 6 },
      channelized: id.includes("channelized")
    };
    m.intersections.push(j);
    for (const [label, x, z, p] of [["North", 0, -220, "north"], ["East", 220, 0, "east"], ["South", 0, 220, "south"], ["West", -220, 0, "west"]]) {
      if (t && p === "south") continue;
      const r = urban(label.toLowerCase(), [point3(x, 0, z), connectionPoint(j, p, m)], p === "north" || p === "south" ? t ? sideCount : mainCount : t ? mainCount : sideCount);
      j.connections.push({ roadId: r.id, end: "end", port: p });
      port(label, end(r, "start"));
    }
  } else if (["urban_boulevard_straight", "urban_boulevard_curve", "elevated_expressway_straight", "elevated_expressway_curve"].includes(id)) {
    const elevated = id.startsWith("elevated"), curved = id.endsWith("curve"), y = elevated ? height : 0;
    const points = curved ? arc3(-300, 0, 300, 300, 0, -Math.PI / 2, y, y) : [point3(0, y, 300), point3(0, y, -300)];
    if (elevated) {
      for (const [label, offset, reverse] of [["northbound", bm, false], ["southbound", -bm, true]]) {
        const pts = curved ? arc3(-300, 0, 300 + offset, 300 + offset, 0, -Math.PI / 2, y, y) : points.map((p) => point3(offset, y, p.z));
        const r = makeRoad(label, reverse ? pts.reverse() : pts, lanes / 2, true);
        port(curved ? reverse ? "West In" : "South In" : reverse ? "North In" : "South In", end(r, "start"));
        port(curved ? reverse ? "South Out" : "West Out" : reverse ? "South Out" : "North Out", end(r, "end"));
      }
    } else {
      const r = urban("boulevard", points, lanes);
      port("South", end(r, "start"));
      port(curved ? "West" : "North", end(r, "end"));
    }
  } else if (id === "urban_overpass") {
    const run = Math.max(600, height / 0.022 + 200);
    const rise = bezier(point3(0, 0, run), point3(0, 0, run - 100), point3(0, height, 240), point3(0, height, 140));
    const fall = bezier(point3(0, height, -140), point3(0, height, -240), point3(0, 0, -run + 100), point3(0, 0, -run));
    const main = urban("overpass", [...rise, point3(0, height, -140), ...fall.slice(1)], lanes);
    main.sidewalk = { enabled: false, width: 3 };
    main.shoulders = { left: 0.75, right: 1.75 };
    main.structure.barrierEnabled = true;
    const street = urban("cross-street", [point3(-300, 0, 0), point3(300, 0, 0)], cross);
    port("South Mainline", end(main, "start"));
    port("North Mainline", end(main, "end"));
    port("West Crossroad", end(street, "start"));
    port("East Crossroad", end(street, "end"));
  } else if (id === "highway_entry" || id === "highway_exit") {
    const entry = id === "highway_entry", span = Math.max(420, height / 0.035 + 180), merge = 140;
    chain("mainline", [point3(0, height, span), point3(0, height, entry ? -merge : merge), point3(0, height, -span)], lanes / 2, "South Mainline In", "North Mainline Out");
    const pts = bezier(point3(100, 0, span), point3(100, 0, span - 200), point3(0, height, 80), point3(0, height, -merge));
    const r = ramp(id, entry ? pts : pts.map((p) => point3(p.x, p.y ?? 0, -p.z)).reverse());
    port(entry ? "South Local Entry" : "North Local Exit", end(r, entry ? "start" : "end"));
  } else if (id === "diamond_interchange") {
    const merge = parameters.length ? Math.max(250, parameters.length / 2 - 100) : Math.max(420, height / 0.035 + 180), span = merge + (parameters.length ? 100 : 180), x = 160 + loopRadius;
    chain("northbound", [point3(bm, height, span), point3(bm, height, merge), point3(bm, height, -merge), point3(bm, height, -span)], lanes / 2, "South Mainline In", "North Mainline Out");
    chain("southbound", [point3(-bm, height, -span), point3(-bm, height, -merge), point3(-bm, height, merge), point3(-bm, height, span)], lanes / 2, "North Mainline In", "South Mainline Out");
    const junction = (label, x2) => {
      const j = { id: name(label), ...meta, type: cross === 6 ? "cross_6lane" : "cross_4lane", position: point3(x2, 0, 0), rotation: 0, connections: [], signalized: true };
      m.intersections.push(j);
      return j;
    };
    const west = junction("west-signal", -x), east = junction("east-signal", x);
    const connect = (j, portName, r, which) => j.connections.push({ roadId: r.id, end: which, port: portName });
    const cp = (j, portName) => connectionPoint(j, portName, m);
    const w = urban("west-local", [point3(-span, 0, 0), cp(west, "west")], cross), mid = urban("local-link", [cp(west, "east"), cp(east, "west")], cross), e = urban("east-local", [cp(east, "east"), point3(span, 0, 0)], cross);
    connect(west, "west", w, "end");
    connect(west, "east", mid, "start");
    connect(east, "west", mid, "end");
    connect(east, "east", e, "start");
    for (const r of [w, mid, e]) {
      r.structure.barrierEnabled = false;
      r.speedLimit = 40;
    }
    port("West Crossroad", end(w, "start"));
    port("East Crossroad", end(e, "end"));
    const tangent = parameters.length ? merge * 0.4 : 230, terminal = parameters.length ? merge * 0.5 : 190;
    const ne = ramp("northbound-exit", bezier(point3(bm, height, merge), point3(bm, height, merge - tangent), point3(x, 0, terminal), cp(east, "south")));
    connect(east, "south", ne, "end");
    const ni = ramp("northbound-entry", bezier(cp(east, "north"), point3(x, 0, -terminal), point3(bm, height, -merge + tangent), point3(bm, height, -merge)));
    connect(east, "north", ni, "start");
    const se = ramp("southbound-exit", bezier(point3(-bm, height, -merge), point3(-bm, height, -merge + tangent), point3(-x, 0, -terminal), cp(west, "north")));
    connect(west, "north", se, "end");
    const si = ramp("southbound-entry", bezier(cp(west, "south"), point3(-x, 0, terminal), point3(-bm, height, merge - tangent), point3(-bm, height, merge)));
    connect(west, "south", si, "start");
  } else if (id === "cloverleaf_interchange" || id === "trumpet_interchange") {
    const B = loopRadius + bc, C = loopRadius + bm, trumpet = id === "trumpet_interchange";
    chain("northbound", [L, A, B, -B, -A, -L].map((z) => point3(bm, height, z)), lanes / 2, "South Mainline In", "North Mainline Out");
    chain("southbound", [-L, -A, -B, B, A, L].map((z) => point3(-bm, height, z)), lanes / 2, "North Mainline In", "South Mainline Out");
    chain("eastbound", (trumpet ? [-C, C, A, L] : [-L, -A, -C, C, A, L]).map((x) => point3(x, 0, bc)), cross / 2, trumpet ? null : "West Crossroad In", trumpet ? "East Branch Out" : "East Crossroad Out");
    chain("westbound", (trumpet ? [L, A, C, -C] : [L, A, C, -C, -A, -L]).map((x) => point3(x, 0, -bc)), cross / 2, trumpet ? "East Branch In" : "East Crossroad In", trumpet ? null : "West Crossroad Out");
    ramp("N-to-E-right", arc3(A, A, A - bm, A - bc, Math.PI, Math.PI / 2, height, 0));
    ramp("W-to-N-right", arc3(A, -A, A - bm, A - bc, Math.PI / 2, Math.PI / 2, 0, height));
    ramp("S-to-E-loop", arc3(-C, B, loopRadius, loopRadius, 0, Math.PI * 1.5, height, 0));
    ramp("W-to-S-loop", arc3(-C, -B, loopRadius, loopRadius, Math.PI / 2, Math.PI * 1.5, 0, height));
    if (!trumpet) {
      ramp("E-to-S-right", arc3(-A, A, A - bm, A - bc, -Math.PI / 2, Math.PI / 2, 0, height));
      ramp("S-to-W-right", arc3(-A, -A, A - bm, A - bc, 0, Math.PI / 2, height, 0));
      ramp("N-to-W-loop", arc3(C, -B, loopRadius, loopRadius, Math.PI, Math.PI * 1.5, height, 0));
      ramp("E-to-N-loop", arc3(C, B, loopRadius, loopRadius, -Math.PI / 2, Math.PI * 1.5, 0, height));
    }
  } else if (id === "roundabout") {
    const r = Math.max(60, radius), delta = Math.PI / 8, angles = Array.from({ length: 8 }, (_, i) => -Math.PI / 2 + delta - i * Math.PI / 4), ring = [];
    for (let i = 0; i < 8; i++)
      ring.push(makeRoad("ring", arc3(0, 0, r, r, angles[i], -Math.PI / 4, 0, 0), rampLanes, true, true));
    ring.forEach((road2, i) => {
      road2.structure.barrierEnabled = false;
      road2.speedLimit = 25;
      link(end(road2, "end"), end(ring[(i + 1) % 8], "start"));
    });
    const directions = ["North", "West", "South", "East"];
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 - i * Math.PI / 2, outNode = i * 2, inNode = (outNode + 1) % 8;
      const d = { x: Math.cos(a), z: Math.sin(a) }, right = { x: -d.z, z: d.x };
      const reach = Math.max(220, r + 140), separation = rampLanes * 3.9 / 2 + 3;
      const q = ring[inNode].centerline[0], angle = angles[inNode];
      const tangent = { x: Math.sin(angle), z: -Math.cos(angle) };
      const aIn = point3(d.x * reach - right.x * separation, 0, d.z * reach - right.z * separation);
      const input = makeRoad("entry", bezier(aIn, point3(aIn.x - d.x * 70, 0, aIn.z - d.z * 70), point3(q.x - tangent.x * 25, 0, q.z - tangent.z * 25), q), rampLanes, true, true);
      const qOut = ring[outNode].centerline[0], outAngle = angles[outNode];
      const tOut = { x: Math.sin(outAngle), z: -Math.cos(outAngle) };
      const aOut = point3(d.x * reach + right.x * separation, 0, d.z * reach + right.z * separation);
      const output = makeRoad("exit", bezier(qOut, point3(qOut.x + tOut.x * 25, 0, qOut.z + tOut.z * 25), point3(aOut.x - d.x * 70, 0, aOut.z - d.z * 70), aOut), rampLanes, true, true);
      for (const road2 of [input, output]) {
        road2.structure.barrierEnabled = false;
        road2.speedLimit = 25;
      }
      link(end(input, "end"), end(ring[inNode], "start"));
      link(end(ring[(outNode + 7) % 8], "end"), end(output, "start"));
      port(`${directions[i]} In`, end(input, "start"));
      port(`${directions[i]} Out`, end(output, "end"));
    }
  } else {
    const prefab = (prefabId, x, z) => m.objects.push({ id: name(prefabId), ...meta, prefabId, position: point3(x, 0, z), rotation: 0 });
    if (id === "residential_block") {
      prefab("residential_low", -35, -20);
      prefab("residential_mid", 30, -20);
      prefab("residential_low", -35, 25);
      prefab("parking", 30, 30);
    }
    if (id === "commercial_block") {
      prefab("office", -40, -25);
      prefab("commercial", 25, -25);
      prefab("parking", -25, 30);
      prefab("parking", 25, 30);
      prefab("bus_stop", 65, 45);
    }
    if (id === "industrial_block") {
      prefab("industrial", -40, -25);
      prefab("industrial", 25, -25);
      prefab("garage", -40, 30);
      prefab("parking", 20, 30);
      prefab("guardrail", 65, 40);
    }
    for (const x of [-60, -20, 20, 60]) {
      prefab("tree", x, -48);
      prefab("streetlight", x, 52);
    }
  }
  const clearance = new RoadClearance(m);
  for (const r of m.roads.filter((r2) => r2.gore?.start)) {
    const source2 = m.roadLinks.find((l) => l.to.roadId === r.id && l.to.end === "start");
    const main = source2 && m.roads.find((r2) => r2.id === source2.from.roadId);
    if (!main) continue;
    const pts = roadPoints(main), s = sampleAt(pts, Math.max(0, polylineLength(pts) - 100)), offset = roadEdges(main).right + 1.2;
    const p = point3(s.point.x - s.tangent.z * offset, s.point.y ?? 0, s.point.z + s.tangent.x * offset);
    if (clearance.permitsProp(p, 0.8)) m.objects.push({ id: name("exit-sign"), ...meta, prefabId: "traffic_sign", position: p, rotation: Math.atan2(s.tangent.x, s.tangent.z) });
  }
  const transform = (q) => transformPoint3(q, position, rotation);
  for (const r of m.roads)
    r.centerline = r.centerline.map(transform);
  for (const e of [...m.intersections, ...m.objects]) {
    e.position = transform(e.position);
    e.rotation += rotation;
  }
  syncConnections(m);
  for (const p of m.connectionPorts) {
    const r = m.roads.find((r2) => r2.id === p.endpoint.roadId), pts = r.centerline;
    const start = p.endpoint.end === "start", a = start ? pts[0] : pts.at(-1), b = start ? pts[1] : pts.at(-2);
    p.position = { ...a };
    p.heading = Math.atan2(a.x - b.x, -(a.z - b.z));
    p.label = directionalPortLabel(p.label, p.heading);
  }
  const report = validateMap(m);
  if (!report.valid)
    throw new Error(`preset.output ${id}: ${report.errors.map((e) => `${e.code} ${e.path}: ${e.message}`).join("; ")}`);
  if (descriptor.production) {
    const issues = validatePresetGeometry(m);
    if (issues.length) throw new Error(`preset.geometry ${id}: ${JSON.stringify(issues)}`);
  }
  return { roads: m.roads, intersections: m.intersections, objects: m.objects, roadLinks: m.roadLinks, connectionPorts: m.connectionPorts, groupId };
}

// src/world/city/MapAPI.ts
function assertValid(map) {
  refreshPortPoses(map);
  const report = validateMap(map);
  if (!report.valid) throw new Error(report.errors.map((e) => e.code + " " + e.path + ": " + e.message).join("\n"));
}
function idFor(map, id, base) {
  const ids = new CityMapIds(map);
  return id === void 0 ? ids.allocate(base) : ids.explicit(id);
}
function createRoad(map, input) {
  if (!Array.isArray(input.centerline)) throw new Error("road.nodes: centerline array required");
  const road = { id: idFor(map, input.id, input.baseName ?? "road"), type: "urban_4lane", centerline: [], laneCount: 4, laneWidth: 3.5, speedLimit: 40, travelDirection: "two-way" };
  applyRoadStyle(road, input.styleId ?? "urban_street_4");
  if (input.crossSection) applyRoadCrossSection(road, input.crossSection);
  const { centerline, baseName: _base, id: _id, ...overrides } = input;
  Object.assign(road, overrides);
  if (input.type && !input.roadClass) {
    delete road.roadClass;
    road.roadClass = roadFunction(road);
  }
  road.centerline = centerline.map((p) => ({ ...p, y: p?.y ?? (road.elevationMode === "elevated" ? road.elevation ?? 6 : 0) }));
  if (centerline.some((p) => p?.y !== void 0 && p.y !== (road.elevation ?? 0)) && input.elevationMode === void 0) road.elevationMode = "custom";
  if (input.type && input.laneCount === void 0) road.laneCount = ROAD_LANES[input.type];
  if (road.type === "ramp_1" && input.travelDirection === void 0) road.travelDirection = "forward";
  const fragment = newCityMap();
  fragment.roads.push(road);
  assertValid(fragment);
  map.roads.push(road);
  return road;
}
function placePrefab(map, input) {
  const { baseName, ...properties } = input;
  const object = { ...properties, id: idFor(map, input.id, baseName ?? input.prefabId), position: { ...input.position, y: input.position.y ?? 0 } };
  const fragment = newCityMap();
  fragment.objects.push(object);
  assertValid(fragment);
  map.objects.push(object);
  return object;
}

// src/editor/EditorMapMetadata.ts
function adoptEditorMetadata(map) {
  const metadata = structuredClone(map.editing ?? { corridors: [], groups: [], attachments: [], ramps: [] });
  const assigned = new Set(metadata.corridors.flatMap((c) => c.roadIds)), named = /* @__PURE__ */ new Map(), groups = /* @__PURE__ */ new Map();
  for (const road of map.roads) if (road.roadNameId && !assigned.has(road.id)) {
    const key = `${road.roadNameId}|${roadFunction(road)}`, ids = named.get(key) ?? [];
    ids.push(road.id);
    named.set(key, ids);
  }
  const used = new Set([...map.roads, ...map.intersections, ...map.objects, ...map.signs ?? [], ...map.roadLinks ?? [], ...map.connectionPorts ?? [], ...metadata.corridors, ...metadata.groups].map((e) => e.id));
  const allocate = (base) => {
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  for (const [key, roadIds] of named) {
    const [nameId, kind] = key.split("|"), name = map.roadNames?.[nameId]?.primaryText ?? nameId;
    metadata.corridors.push({ id: allocate(`corridor:${nameId}:${kind}`), name: `${name} \xB7 ${kind}`, roadIds });
  }
  const grouped = new Set(metadata.groups.flatMap((g) => g.memberIds));
  for (const e of [...map.roads, ...map.intersections, ...map.objects]) if (e.groupId && !grouped.has(e.id)) {
    const ids = groups.get(e.groupId) ?? [];
    ids.push(e.id);
    groups.set(e.groupId, ids);
  }
  for (const [name, memberIds] of groups) metadata.groups.push({ id: allocate(`group:${name}`), name, memberIds, kind: map.roads.some((r) => memberIds.includes(r.id) && r.presetSource) ? "interchange" : "corridor", locked: false });
  return { ...map, editing: metadata };
}

// src/editor/CityEditorHistory.ts
var CityEditorHistory = class {
  undoStack = [];
  redoStack = [];
  transactions = [];
  undone = [];
  /** Kernel maps are immutable snapshots sharing untouched objects. No whole-map serialization. */
  recordTransaction(before, after, label) {
    if (before === after) return;
    this.transactions.push({ before, after, label });
    if (this.transactions.length > 64) this.transactions.shift();
    this.undone.length = 0;
  }
  record(before, after) {
    const snapshot = JSON.stringify(before);
    if (snapshot === JSON.stringify(after)) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 64) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo(current) {
    const transaction = this.transactions.pop();
    if (transaction) {
      this.undone.push(transaction);
      return transaction.before;
    }
    const snapshot = this.undoStack.pop();
    if (!snapshot) return null;
    this.redoStack.push(JSON.stringify(current));
    return JSON.parse(snapshot);
  }
  redo(current) {
    const transaction = this.undone.pop();
    if (transaction) {
      this.transactions.push(transaction);
      return transaction.after;
    }
    const snapshot = this.redoStack.pop();
    if (!snapshot) return null;
    this.undoStack.push(JSON.stringify(current));
    return JSON.parse(snapshot);
  }
  get canUndo() {
    return this.transactions.length > 0 || this.undoStack.length > 0;
  }
  get canRedo() {
    return this.undone.length > 0 || this.redoStack.length > 0;
  }
};

// src/editor/EditorCommands.ts
var preset = (label, roadClass, lanes, speed, shouldered = false, oneWay = false) => ({
  label,
  properties: {
    roadClass,
    crossSection: shouldered ? "shouldered" : lanes > 2 ? "boulevard" : "street",
    laneCount: lanes,
    laneWidth: shouldered ? 3.75 : 3.6,
    speedLimit: speed,
    travelDirection: oneWay ? "forward" : "two-way",
    sidewalk: { enabled: !shouldered, width: lanes > 2 ? 3 : 2 },
    curb: !shouldered,
    shoulders: { left: shouldered ? 0.75 : 0, right: shouldered ? 1.75 : 0 },
    elevationMode: "custom"
  }
});
var EDITOR_ROAD_PRESETS = {
  local: preset("Local 1+1", "local", 2, 30),
  collector: preset("Collector 2+2", "collector", 4, 40),
  arterial4: preset("Arterial 2+2", "arterial", 4, 50),
  arterial6: preset("Arterial 3+3", "arterial", 6, 60),
  arterial8: preset("Arterial 4+4", "arterial", 8, 60),
  expressway6: preset("Expressway 3+3", "expressway", 6, 80, true),
  expressway8: preset("Expressway 4+4", "expressway", 8, 80, true),
  frontage2: preset("Frontage 1+1", "frontage", 2, 40),
  frontage4: preset("Frontage 2+2", "frontage", 4, 40),
  ramp1: preset("Ramp 1 lane", "ramp", 1, 40, true, true),
  ramp2: preset("Ramp 2 lane", "ramp", 2, 40, true, true)
};

// src/editor/EditorGeometry.ts
var distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function bounds(points, margin = 0) {
  return {
    minX: Math.min(...points.map((p) => p.x)) - margin,
    maxX: Math.max(...points.map((p) => p.x)) + margin,
    minZ: Math.min(...points.map((p) => p.z)) - margin,
    maxZ: Math.max(...points.map((p) => p.z)) + margin
  };
}
var overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
function union(areas) {
  return areas.length ? { minX: Math.min(...areas.map((a) => a.minX)), maxX: Math.max(...areas.map((a) => a.maxX)), minZ: Math.min(...areas.map((a) => a.minZ)), maxZ: Math.max(...areas.map((a) => a.maxZ)) } : null;
}
function project(points, p) {
  let best = { point: points[0], distance: Infinity, along: 0, tangent: { x: 1, z: 0 } }, along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (!length) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (length * length)));
    const point = { x: a.x + dx * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + dz * t }, gap = distance(point, p);
    if (gap < best.distance) best = { point, distance: gap, along: along + t * length, tangent: { x: dx / length, z: dz / length } };
    along += length;
  }
  return best;
}
function slicePath(points, start, end) {
  const result = [sampleAt(points, start).point];
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += distance(points[i - 1], points[i]);
    if (d > start + 0.05 && d < end - 0.05) result.push({ ...points[i] });
  }
  const last = sampleAt(points, end).point;
  if (distance(result.at(-1), last) > 0.05) result.push(last);
  return result;
}
function parallelPath(road, offset) {
  const points = roadPoints(road);
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const before = distance(a, p), after = distance(p, b);
    const n1 = before ? { x: -(p.z - a.z) / before, z: (p.x - a.x) / before } : { x: -(b.z - p.z) / after, z: (b.x - p.x) / after };
    const n2 = after ? { x: -(b.z - p.z) / after, z: (b.x - p.x) / after } : n1;
    const scale = offset / Math.max(0.25, 1 + n1.x * n2.x + n1.z * n2.z);
    return { x: p.x + (n1.x + n2.x) * scale, y: p.y, z: p.z + (n1.z + n2.z) * scale };
  });
}
function crossings(a, b) {
  const result = [];
  for (let i = 1; i < a.length; i++) for (let k2 = 1; k2 < b.length; k2++) {
    const p = a[i - 1], q = b[k2 - 1], u = { x: a[i].x - p.x, z: a[i].z - p.z }, v = { x: b[k2].x - q.x, z: b[k2].z - q.z };
    const cross = u.x * v.z - u.z * v.x;
    if (Math.abs(cross) < 1e-8) continue;
    const t = ((q.x - p.x) * v.z - (q.z - p.z) * v.x) / cross, s = ((q.x - p.x) * u.z - (q.z - p.z) * u.x) / cross;
    if (t < -1e-6 || t > 1.000001 || s < -1e-6 || s > 1.000001) continue;
    const point = { x: p.x + t * u.x, y: (p.y ?? 0) + ((a[i].y ?? 0) - (p.y ?? 0)) * t, z: p.z + t * u.z };
    if (!result.some((r) => distance(r.point, point) < 0.2)) result.push({ point, otherY: (q.y ?? 0) + ((b[k2].y ?? 0) - (q.y ?? 0)) * s });
  }
  return result;
}
function maxGrade(road) {
  const p = roadPoints(road);
  let grade = 0;
  for (let i = 1; i < p.length; i++) grade = Math.max(grade, Math.abs((p[i].y ?? 0) - (p[i - 1].y ?? 0)) / Math.max(1e-3, distance(p[i], p[i - 1])));
  return grade;
}
function cubicPath(controls) {
  if (controls.length !== 4) throw new Error("Cubic path requires four handles");
  const [a, b, c, d] = controls;
  const count = Math.max(24, Math.ceil((distance(a, b) + distance(b, c) + distance(c, d)) / 4));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, s = 1 - t;
    return { x: s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t * t * t * d.x, y: s * s * s * (a.y ?? 0) + 3 * s * s * t * (b.y ?? 0) + 3 * s * t * t * (c.y ?? 0) + t * t * t * (d.y ?? 0), z: s * s * s * a.z + 3 * s * s * t * b.z + 3 * s * t * t * c.z + t * t * t * d.z };
  });
}
var EditorSpatialIndex = class {
  constructor(cellSize = 200) {
    this.cellSize = cellSize;
  }
  cellSize;
  cells = /* @__PURE__ */ new Map();
  entries = /* @__PURE__ */ new Map();
  keys(a) {
    const keys = [];
    for (let x = Math.floor(a.minX / this.cellSize); x <= Math.floor(a.maxX / this.cellSize); x++) for (let z = Math.floor(a.minZ / this.cellSize); z <= Math.floor(a.maxZ / this.cellSize); z++) keys.push(`${x},${z}`);
    return keys;
  }
  set(id, area) {
    this.delete(id);
    this.entries.set(id, area);
    for (const key of this.keys(area)) {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = /* @__PURE__ */ new Set());
      cell.add(id);
    }
  }
  delete(id) {
    const area = this.entries.get(id);
    if (area) for (const key of this.keys(area)) {
      const cell = this.cells.get(key);
      cell?.delete(id);
      if (!cell?.size) this.cells.delete(key);
    }
    this.entries.delete(id);
  }
  query(area) {
    const ids = /* @__PURE__ */ new Set();
    for (const key of this.keys(area)) for (const id of this.cells.get(key) ?? []) if (overlaps(this.entries.get(id), area)) ids.add(id);
    return [...ids];
  }
};

// src/world/city/SignalPlacement.ts
function approachPaintOffsets(map, j, mouth, outward) {
  let boundaryOffset = 0.8;
  while (boundaryOffset < 30 && junctionSurfaceContains(j, map, { x: mouth.x + outward.x * boundaryOffset, y: mouth.y, z: mouth.z + outward.z * boundaryOffset }, 0.15)) boundaryOffset += 0.4;
  return { boundaryOffset, crossOffset: boundaryOffset + 2.2, stopOffset: boundaryOffset + 4.4, paintApproach: boundaryOffset < 30 };
}
function findSignalPole(map, j, outward, right, h, width, height, origin = j.position) {
  const clearance = runtimeRoadClearance(map), base = Math.min(0, j.position.y ?? 0);
  for (const side of [-1, 1]) for (const extra of [1, 4, 8, 14]) for (let lateral = width / 2 + 1; lateral <= width / 2 + 24; lateral += 1) {
    const p = { x: origin.x + side * outward.x * (h + extra) + right.x * lateral, y: base, z: origin.z + side * outward.z * (h + extra) + right.z * lateral };
    if (!clearance.roadAt(p, 0.55, base - 0.2, (j.position.y ?? 0) + height + 0.5, void 0, void 0, true) && !clearance.junctionAt(p, 0.55, base - 0.2, (j.position.y ?? 0) + height + 0.5)) return p;
  }
  throw new Error("No signal pole clear of traffic at " + j.id);
}
function signalApproach(map, j, port) {
  const connection = j.connections.find((c) => c.port === port), road = map.roads.find((r) => r.id === connection?.roadId);
  if (!connection || !road) throw new Error("Unknown signal approach " + j.id + ":" + port);
  const path = roadPoints(road), start = connection.end === "start", mouth = start ? path[0] : path.at(-1), neighbour = start ? path[1] : path.at(-2);
  const length = Math.hypot(neighbour.x - mouth.x, neighbour.z - mouth.z) || 1, outward = { x: (neighbour.x - mouth.x) / length, z: (neighbour.z - mouth.z) / length }, right = { x: outward.z, z: -outward.x };
  const incoming = road.travelDirection === "two-way" || road.travelDirection === "forward" === (connection.end === "end");
  const localMouth = j.approachOffsets?.[port] ?? rotatePoint({ x: mouth.x - j.position.x, z: mouth.z - j.position.z }, -j.rotation), reach = Math.max(junctionApproachExtent(j, map, port), Math.hypot(localMouth.x, localMouth.z));
  const override = j.signals?.placements?.[port];
  const width = road.laneCount * road.laneWidth, height = override?.headHeight ?? (j.signals?.profile ? Math.max(7.2, j.signals.headHeight ?? 7.2) : j.signals?.headHeight ?? 5.8);
  const base = rotatePoint(localMouth, j.rotation), origin = { x: j.position.x + base.x, y: j.position.y ?? 0, z: j.position.z + base.z };
  const legacy = { x: origin.x - outward.x * (reach + 1) + right.x * (width / 2 + 1), y: j.position.y ?? 0, z: origin.z - outward.z * (reach + 1) + right.z * (width / 2 + 1) };
  const pole = findSignalPole(map, j, outward, right, reach, width, height, origin);
  const expectedPosition = { ...pole, y: j.position.y ?? 0 }, expectedHeading = Math.atan2(-outward.x, -outward.z);
  const paint = approachPaintOffsets(map, j, origin, outward), lateral = road.travelDirection === "two-way" ? width / 4 : 0;
  const stopLine = { position: { x: origin.x + outward.x * paint.stopOffset + right.x * lateral, y: origin.y, z: origin.z + outward.z * paint.stopOffset + right.z * lateral }, width: (road.travelDirection === "two-way" ? width / 2 : width) - 0.25, depth: 0.35, derived: true, enabled: j.signalized && incoming && paint.paintApproach };
  return { intersectionId: j.id, approach: port, roadId: road.id, incoming, mouth, outward, incomingTangent: { x: -outward.x, z: -outward.z }, right, roadWidth: width, height, divided: j.type === "divided_cross", expectedPosition, expectedHeading, position: override?.position ?? (j.signals?.profile ? expectedPosition : legacy), heading: override?.heading ?? expectedHeading, derived: !override, oppositeSideCandidate: expectedPosition, stopLine, paintOffsets: paint };
}

// src/editor/RoadDiagnostics.ts
var R = Math.PI / 180;
var round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
var severityRank = { info: 0, warning: 1, error: 2 };
var turn = (a, b, c) => {
  const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
  return Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
};
var horizontal = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
function stations(points) {
  const result = [0];
  for (let i = 1; i < points.length; i++) result.push(result[i - 1] + horizontal(points[i - 1], points[i]));
  return result;
}
function resample(points, step = 3) {
  const length = polylineLength(points);
  if (length < 1e-6 || points.length < 2) return points.map((p) => ({ ...p }));
  const result = [];
  for (let d = 0; d < length; d += step) result.push({ ...sampleAt(points, d).point });
  result.push({ ...sampleAt(points, length).point });
  return result;
}
function chordDeviation(a, b, c) {
  const dx = c.x - a.x, dz = c.z - a.z, length = Math.hypot(dx, dz);
  if (length < 1e-6) return horizontal(a, b);
  return Math.abs((b.x - a.x) * dz - (b.z - a.z) * dx) / length;
}
function segmentIntersection(a, b, c, d) {
  const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z;
  const den = ux * vz - uz * vx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / den;
  const s = ((c.x - a.x) * uz - (c.z - a.z) * ux) / den;
  if (t < 0.02 || t > 0.98 || s < 0.02 || s > 0.98) return null;
  return { x: a.x + ux * t, z: a.z + uz * t };
}
function movingAverage(values, radius) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0, count = 0;
    for (let k2 = Math.max(0, i - radius); k2 <= Math.min(values.length - 1, i + radius); k2++) {
      sum += values[k2];
      count++;
    }
    result.push(sum / count);
  }
  return result;
}
function gradeCounts(points, deadband = 6e-3) {
  const table = stations(points);
  let max = 0, reversals = 0, previous = 0;
  const at = [];
  for (let i = 1; i < points.length; i++) {
    const length = table[i] - table[i - 1];
    if (length < 0.05) continue;
    const grade = ((points[i].y ?? 0) - (points[i - 1].y ?? 0)) / length;
    max = Math.max(max, Math.abs(grade));
    if (Math.abs(grade) < deadband) continue;
    const sign = Math.sign(grade);
    if (previous && sign !== previous) {
      reversals++;
      at.push(table[i]);
    }
    previous = sign;
  }
  return { max, reversals, stations: at };
}
function horizontalLoop(points) {
  if (points.length < 6) return false;
  let total = 0, positive = 0, negative = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const angle = turn(points[i - 1], points[i], points[i + 1]);
    total += angle;
    if (angle > 0) positive += Math.abs(angle);
    else negative += Math.abs(angle);
  }
  return Math.abs(total) > Math.PI * 1.55 && Math.max(positive, negative) > Math.min(positive, negative) * 2.5;
}
function zigzag(points, table) {
  let best = null;
  const turns = [];
  for (let i = 1; i < points.length - 1; i++) {
    const angle = turn(points[i - 1], points[i], points[i + 1]);
    if (Math.abs(angle) >= 6 * R) turns.push({ station: table[i], angle });
  }
  for (let start = 0; start < turns.length; start++) {
    let sign = 0, reversals = 0, end = start;
    while (end + 1 < turns.length && turns[end + 1].station - turns[start].station <= 90) {
      end++;
      const next = Math.sign(turns[end].angle);
      if (sign && next !== sign) reversals++;
      sign = next;
    }
    if (reversals < 3) continue;
    const from = sampleAt(points, turns[start].station).point, to = sampleAt(points, turns[end].station).point;
    let swing = 0;
    for (let i = start; i <= end; i++) {
      const p = sampleAt(points, turns[i].station).point;
      swing = Math.max(swing, chordDeviation(from, p, to));
    }
    if (swing < 0.35) continue;
    if (!best || reversals > best.reversals || reversals === best.reversals && swing > best.swing)
      best = { station: turns[start].station, reversals, swing };
  }
  return best;
}
function elevationExtrema(points, table) {
  const extrema = [];
  for (let i = 1; i < points.length - 1; i++) {
    const y0 = points[i - 1].y ?? 0, y1 = points[i].y ?? 0, y2 = points[i + 1].y ?? 0;
    if (y1 >= y0 && y1 > y2 || y1 <= y0 && y1 < y2) {
      const amplitude = Math.abs(y1 - (y0 + y2) / 2);
      if (amplitude > 0.12) extrema.push({ station: table[i], amplitude, high: y1 >= y0 });
    }
  }
  return extrema;
}
function highFrequencyHeightOscillation(points, table) {
  let count = 0, amplitude = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const before = (points[i].y ?? 0) - (points[i - 1].y ?? 0);
    const after = (points[i + 1].y ?? 0) - (points[i].y ?? 0);
    const span = table[i + 1] - table[i - 1];
    if (span > 35 || span < 0.05) continue;
    if (Math.sign(before) && Math.sign(before) !== Math.sign(after) && Math.abs(before) > 0.07 && Math.abs(after) > 0.07) {
      count++;
      amplitude = Math.max(amplitude, Math.min(Math.abs(before), Math.abs(after)));
    }
  }
  return { count, amplitude };
}
function waveMetrics(points) {
  const samples = resample(points, 3), table = stations(samples), heights = samples.map((p) => p.y ?? 0);
  const trendRadius = 4;
  const trend = movingAverage(heights, Math.min(trendRadius, Math.max(1, Math.floor(samples.length / 8))));
  const residual = heights.map((h, i) => h - trend[i]);
  if (residual.length > 4) {
    const radius = Math.min(4, Math.floor(residual.length / 4));
    for (let i = 0; i < radius; i++) {
      residual[i] = 0;
      residual[residual.length - 1 - i] = 0;
    }
  }
  let crossings2 = 0, sign = 0;
  const threshold = 0.08;
  for (const value of residual) {
    if (value > threshold) {
      if (sign < 0) crossings2++;
      sign = 1;
    } else if (value < -threshold) {
      if (sign > 0) crossings2++;
      sign = -1;
    }
  }
  const rms = Math.sqrt(residual.reduce((sum, value) => sum + value * value, 0) / Math.max(1, residual.length));
  const extrema = elevationExtrema(samples, table);
  let amplitude = 0;
  for (const e of extrema) amplitude = Math.max(amplitude, e.amplitude);
  const grades = gradeCounts(samples);
  return { crossings: crossings2, rms, reversals: grades.reversals, maxGrade: grades.max, amplitude };
}
function segmentGradeChanges(points, table) {
  const result = [];
  for (let i = 2; i < points.length - 1; i++) {
    const a = table[i - 1] - table[i - 2], b = table[i] - table[i - 1];
    if (a < 0.05 || b < 0.05 || a + b > 30) continue;
    const g1 = ((points[i - 1].y ?? 0) - (points[i - 2].y ?? 0)) / a;
    const g2 = ((points[i].y ?? 0) - (points[i - 1].y ?? 0)) / b;
    const change = Math.abs(g2 - g1);
    if (change > 0.07) result.push({ station: table[i], change });
  }
  return result;
}
function redundantElevationPoints(points, table) {
  let count = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const span = table[i + 1] - table[i - 1];
    if (span < 0.05) continue;
    const expected = (points[i - 1].y ?? 0) + ((points[i + 1].y ?? 0) - (points[i - 1].y ?? 0)) * ((table[i] - table[i - 1]) / span);
    if (Math.abs((points[i].y ?? 0) - expected) < 0.02) count++;
  }
  return count;
}
function roadIssue(severity, code, road, message, extra = {}) {
  return { severity, code, roadId: road.id, message, metrics: { roadClass: roadFunction(road), length: round(polylineLength(roadPoints(road))), ...extra.metrics }, ...extra };
}
function diagnoseRoad(row) {
  const issues = [], points = roadPoints(row), raw = roadPoints({ ...row, curve: "polyline" });
  if (points.length < 2) return issues;
  const table = stations(points), rawTable = stations(raw), loop = horizontalLoop(points);
  const ramp = roadFunction(row) === "ramp";
  const horizontalRepair = { op: ramp ? "repairRamp" : "smoothRoad", id: row.id, strength: 1, preserveEndpoints: true };
  const verticalRepair = { op: ramp ? "repairRamp" : "repairElevation", id: row.id, preserveEndpoints: true, monotonic: ramp ? void 0 : false };
  const segments = [];
  for (let i = 1; i < points.length; i++) segments.push(horizontal(points[i - 1], points[i]));
  const short = segments.filter((v) => v < 1.5).length;
  if (short >= 2 && !loop) issues.push(roadIssue(short >= 4 ? "warning" : "info", "geometry.shortSegments", row, `${short} road segments shorter than 1.5 m`, { metrics: { shortSegments: short }, repair: horizontalRepair }));
  if (!loop) {
    const bends = [];
    for (let i = 1; i < points.length - 1; i++) {
      const angle = Math.abs(turn(points[i - 1], points[i], points[i + 1]));
      if (angle < 38 * R) continue;
      const a = segments[i - 1] ?? 0, b = segments[i] ?? 0;
      const radius = angle > 1e-4 ? Math.min(a, b) / (2 * Math.sin(Math.min(Math.PI - 1e-4, angle) / 2)) : Infinity;
      bends.push({ index: i, station: table[i], angle, radius, span: a + b });
    }
    if (bends.length) {
      const clusters = [];
      for (const bend of bends) {
        const last = clusters.at(-1);
        if (last && bend.index - last.at(-1).index <= 2) last.push(bend);
        else clusters.push([bend]);
      }
      let worst = clusters[0];
      for (const cluster of clusters) if (Math.max(...cluster.map((b) => b.angle)) > Math.max(...worst.map((b) => b.angle))) worst = cluster;
      const peak = worst.reduce((best, bend) => bend.angle > best.angle ? bend : best);
      const angle = peak.angle / R;
      if (angle >= 50 && (peak.radius < 35 || angle >= 65)) issues.push(roadIssue(angle >= 80 ? "error" : "warning", "geometry.sharpBend", row, `${angle.toFixed(0)}\xB0 bend over ${round(peak.span)} m`, { station: round(peak.station), metrics: { angleDegrees: round(angle, 0), radius: round(peak.radius), span: round(peak.span) }, repair: { ...horizontalRepair, strength: angle >= 80 ? 1.5 : 1 } }));
    }
    const zig = zigzag(points, table);
    if (zig) issues.push(roadIssue("warning", "geometry.zigzag", row, `${zig.reversals} alternating bends within ${round(zig.swing)} m lateral swing`, { station: round(zig.station), metrics: { reversals: zig.reversals, swing: round(zig.swing) }, repair: { ...horizontalRepair, strength: 1.25 } }));
    for (let i = 1; i < points.length - 2; i++) {
      const first = turn(points[i - 1], points[i], points[i + 1]);
      const second = turn(points[i], points[i + 1], points[i + 2]);
      if (Math.abs(first) < 25 * R || Math.abs(second) < 25 * R || Math.sign(first) === Math.sign(second)) continue;
      if (Math.min(segments[i] ?? 0, segments[i - 1] ?? 0, segments[i + 1] ?? 0) > 35) continue;
      issues.push(roadIssue("warning", "geometry.awkwardS", row, "Tight S bend between two opposite turns", { station: round(table[i]), metrics: { firstDegrees: round(Math.abs(first) / R, 0), secondDegrees: round(Math.abs(second) / R, 0) }, repair: horizontalRepair }));
      break;
    }
  }
  let collinear = 0;
  for (let i = 1; i < raw.length - 1; i++) {
    const before = horizontal(raw[i - 1], raw[i]), after = horizontal(raw[i], raw[i + 1]);
    if (before < 0.5 || after < 0.5) continue;
    if (Math.abs(turn(raw[i - 1], raw[i], raw[i + 1])) < 0.8 * R || chordDeviation(raw[i - 1], raw[i], raw[i + 1]) < 0.02) collinear++;
  }
  if (collinear >= 2) issues.push(roadIssue("info", "geometry.redundantControlPoints", row, `${collinear} redundant centerline points`, { metrics: { redundantPoints: collinear }, repair: { op: "simplifyRoad", id: row.id, tolerance: 0.2 } }));
  if (!loop && points.length <= 700) {
    const limit = Math.min(points.length - 2, 500);
    outer: for (let i = 1; i < limit; i++) for (let k2 = i + 2; k2 < limit; k2++) {
      if (i === 0 && k2 === points.length - 1) continue;
      if (segments[i - 1] + segments[k2 - 1] < 2) continue;
      const hit = segmentIntersection(points[i - 1], points[i], points[k2 - 1], points[k2]);
      if (hit && Math.abs((points[i - 1].y ?? 0) - (points[k2 - 1].y ?? 0)) < 0.5) {
        issues.push(roadIssue("warning", "geometry.selfIntersection", row, "Road centerline crosses itself", { metrics: { x: round(hit.x), z: round(hit.z) }, repair: horizontalRepair }));
        break outer;
      }
    }
  }
  const wave = waveMetrics(points);
  const grades = gradeCounts(points);
  if (grades.max > 0.25) issues.push(roadIssue("error", "vertical.excessiveGrade", row, `Maximum grade ${(grades.max * 100).toFixed(1)}%`, { metrics: { maxGradePercent: round(grades.max * 100) }, repair: verticalRepair }));
  else if (grades.max > 0.12) issues.push(roadIssue("warning", "vertical.steepGrade", row, `Grade ${(grades.max * 100).toFixed(1)}% exceeds 12%`, { metrics: { maxGradePercent: round(grades.max * 100) }, repair: verticalRepair }));
  if (wave.crossings >= 3 && wave.rms >= 0.11) issues.push(roadIssue("warning", "vertical.wave", row, `Elevation oscillates ${wave.crossings} times (${round(wave.rms, 2)} m RMS)`, { metrics: { reversals: wave.reversals, crossings: wave.crossings, rms: round(wave.rms, 2), amplitude: round(wave.amplitude, 2), maxGradePercent: round(wave.maxGrade * 100) }, repair: { ...verticalRepair, strength: 2 } }));
  else if (wave.reversals >= 4) issues.push(roadIssue("info", "vertical.gradeReversals", row, `${wave.reversals} grade direction changes`, { metrics: { reversals: wave.reversals, maxGradePercent: round(wave.maxGrade * 100) }, repair: verticalRepair }));
  const rawExtrema = elevationExtrema(raw, rawTable);
  const close = rawExtrema.filter((e, i) => i > 0 && e.station - rawExtrema[i - 1].station < 30 && Math.abs(e.amplitude) > 0.12);
  const heightOscillation = highFrequencyHeightOscillation(raw, rawTable);
  if (rawExtrema.length >= 3 && heightOscillation.count >= 3 && heightOscillation.amplitude >= 0.1)
    issues.push(roadIssue("warning", "vertical.elevationPointOscillation", row, `${heightOscillation.count} high-frequency elevation control points`, { metrics: { oscillations: heightOscillation.count, amplitude: round(heightOscillation.amplitude, 2), closeExtrema: close.length }, repair: { ...verticalRepair, strength: 2 } }));
  const abrupt = segmentGradeChanges(raw, rawTable);
  if (abrupt.length) {
    const worst = abrupt.reduce((a, b) => a.change > b.change ? a : b);
    issues.push(roadIssue("warning", "vertical.abruptGradeChange", row, `Grade changes ${(worst.change * 100).toFixed(0)}% over a short interval`, { station: round(worst.station), metrics: { gradeChangePercent: round(worst.change * 100) }, repair: verticalRepair }));
  }
  const redundantY = redundantElevationPoints(raw, rawTable);
  if (redundantY >= 2) issues.push(roadIssue("info", "vertical.redundantElevationPoints", row, `${redundantY} redundant elevation points`, { metrics: { redundantPoints: redundantY }, repair: { op: "simplifyRoad", id: row.id, tolerance: 0.1 } }));
  if (ramp) {
    const start = raw[0]?.y ?? 0, end = raw.at(-1)?.y ?? 0, net = Math.abs(end - start);
    let variation = 0;
    for (let i = 1; i < raw.length; i++) variation += Math.abs((raw[i].y ?? 0) - (raw[i - 1].y ?? 0));
    if (net > 1.5 && variation > net * 1.7) {
      const moderate = variation < net * 2.5;
      issues.push(roadIssue(moderate ? "warning" : "info", "vertical.rampReversal", row, `Ramp rises/falls ${round(variation)} m for a ${round(net)} m net change`, { metrics: { netChange: round(net), totalVariation: round(variation) }, repair: { op: "repairRamp", id: row.id, strength: 1.5, ...moderate ? { monotonic: true } : {} } }));
    }
  }
  return issues;
}
function endpointOf(row, end) {
  const points = roadPoints(row);
  return end === "start" ? points[0] : points.at(-1);
}
function isOneWay(row) {
  return row.travelDirection === "forward" || row.travelDirection === "reverse";
}
function cornerCrosswalk(row, mouth, outward, offset) {
  const edges = roadEdges(row);
  return { center: { x: mouth.x + outward.x * offset, y: mouth.y, z: mouth.z + outward.z * offset }, right: { x: outward.z, z: -outward.x }, width: edges.right - edges.left };
}
function outsideStopOffset(j, map, mouth, outward) {
  return approachPaintOffsets(map, j, mouth, outward).boundaryOffset;
}
function obbOverlap(a, b) {
  const axes = [a.right, { x: -a.right.z, z: a.right.x }, b.right, { x: -b.right.z, z: b.right.x }];
  const dx = b.center.x - a.center.x, dz = b.center.z - a.center.z;
  const halfDepth = 1.5;
  for (const axis of axes) {
    const ra = Math.abs(axis.x * a.right.x + axis.z * a.right.z) * a.width / 2 + Math.abs(axis.x * -a.right.z + axis.z * a.right.x) * halfDepth;
    const rb = Math.abs(axis.x * b.right.x + axis.z * b.right.z) * b.width / 2 + Math.abs(axis.x * -b.right.z + axis.z * b.right.x) * halfDepth;
    if (Math.abs(dx * axis.x + dz * axis.z) > ra + rb) return false;
  }
  return true;
}
function junctionMarkingIssues(j, map, otherJunctions) {
  const issues = [], name = j.id;
  const add = (severity, code, message, extra = {}) => issues.push({ severity, code, intersectionId: name, message, ...extra });
  const footprint = j.pavementFootprint;
  if (!footprint) add("warning", "intersection.noFootprint", "Junction has no authored pavement footprint", { repair: { op: "repairIntersection", id: name } });
  if (j.markingFootprint?.kind === "junction" || !j.markingFootprint && footprint)
    add("info", "marking.genericFootprint", "Marking suppression uses a generic footprint instead of the final pavement polygon", { repair: { op: "repairIntersection", id: name } });
  const points = /* @__PURE__ */ new Map();
  for (const c of j.connections) {
    const row = map.roads.find((r) => r.id === c.roadId);
    if (!row) {
      add("error", "intersection.missingApproach", `Connection ${c.roadId} has no road`);
      continue;
    }
    const path = roadPoints(row), start = c.end === "start", neighbour = start ? path[1] ?? path[0] : path.at(-2) ?? path.at(-1);
    const mouth = endpointOf(row, c.end);
    const mx = neighbour.x - mouth.x, mz = neighbour.z - mouth.z, ml = Math.hypot(mx, mz) || 1;
    const outward = { x: mx / ml, z: mz / ml }, local = { x: mouth.x - j.position.x, z: mouth.z - j.position.z };
    if (footprint && !junctionSurfaceContains(j, map, mouth, 1)) add("warning", "intersection.mouthOutsideFootprint", `Approach ${c.roadId}:${c.end} is outside its pavement footprint`, { station: 0, metrics: { roadId: c.roadId }, repair: { op: "repairIntersection", id: name } });
    const expected = j.pavementHeights?.[c.port] ?? j.position.y ?? 0;
    if (Math.abs((mouth.y ?? 0) - expected) > 0.2) add("error", "intersection.heightMismatch", `Approach ${c.roadId} is ${round((mouth.y ?? 0) - expected, 2)} m above the junction mouth`, { metrics: { roadId: c.roadId, gap: round(Math.abs((mouth.y ?? 0) - expected), 2) } });
    if (polylineLength(roadPoints(row)) < 12) add("warning", "intersection.shortApproach", `Approach ${c.roadId} is only ${round(polylineLength(roadPoints(row)))} m long`, { metrics: { roadId: c.roadId, length: round(polylineLength(roadPoints(row))) }, repair: { op: "repairIntersection", id: name } });
    const incoming = row.travelDirection === "two-way" || row.travelDirection === "forward" === (c.end === "end");
    points.set(c.port, { row, mouth, outward, local, incoming });
  }
  if (footprint) {
    const h = Math.max(...footprint.map((p) => Math.hypot(p.x, p.z)));
    for (const [port, p] of points) if (Math.hypot(p.local.x, p.local.z) > h + 3) add("warning", "intersection.approachReach", `Arm ${port} extends ${round(Math.hypot(p.local.x, p.local.z) - h)} m beyond the footprint`, { metrics: { port, excess: round(Math.hypot(p.local.x, p.local.z) - h) }, repair: { op: "repairIntersection", id: name } });
  }
  const entries = [...points.entries()];
  for (let i = 0; i < entries.length; i++) for (let k2 = i + 1; k2 < entries.length; k2++) {
    const a = entries[i][1], b = entries[k2][1];
    if (a.row.id === b.row.id) continue;
    const dot = a.outward.x * b.outward.x + a.outward.z * b.outward.z;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) / R;
    if (angle < 30) {
      const divided = isOneWay(a.row) && isOneWay(b.row) && (a.row.roadNameId && a.row.roadNameId === b.row.roadNameId || a.row.groupId && a.row.groupId === b.row.groupId);
      if (!divided) add("warning", "intersection.acuteApproach", `Arms ${entries[i][0]} and ${entries[k2][0]} meet at ${round(angle, 0)}\xB0`, { metrics: { angleDegrees: round(angle, 0), portA: entries[i][0], portB: entries[k2][0] }, repair: { op: "repairIntersection", id: name } });
    }
  }
  if (j.portAngles) for (const [port, entry] of points) {
    const authored = j.portAngles[port];
    if (authored === void 0) continue;
    const actual = Math.atan2(entry.outward.x, -entry.outward.z);
    const delta = Math.abs(Math.atan2(Math.sin(actual - authored), Math.cos(actual - authored))) / R;
    if (delta > 25) add("warning", "intersection.stalePortAngle", `Port ${port} bearing differs from the road by ${round(delta, 0)}\xB0`, { metrics: { port, deltaDegrees: round(delta, 0) }, repair: { op: "repairIntersection", id: name } });
  }
  const crosswalks = [];
  for (const [port, entry] of points) {
    const offset = outsideStopOffset(j, map, entry.mouth, entry.outward);
    const stopOffset = offset + 4.4;
    const stop = { x: entry.mouth.x + entry.outward.x * stopOffset, y: entry.mouth.y, z: entry.mouth.z + entry.outward.z * stopOffset };
    if (offset >= 30 && footprint) add("warning", "intersection.approachKink", `Approach ${port} runs along the junction edge; smooth it before rebuilding markings`, { metrics: { port, offset }, repair: { op: "repairIntersection", id: name } });
    else if (offset > 8) add("warning", "marking.stopLineDisplaced", `Stop line on ${port} is ${round(offset)} m from the mouth because the approach is tangential`, { metrics: { port, offset: round(offset) }, repair: { op: "repairIntersection", id: name } });
    else if (footprint && junctionSurfaceContains(j, map, stop, 0.05)) add("error", "marking.stopLineInside", `Stop line on ${port} sits inside the junction pavement`, { metrics: { port }, repair: { op: "repairIntersection", id: name } });
    if (j.signalized) crosswalks.push({ port, row: entry.row, box: cornerCrosswalk(entry.row, entry.mouth, entry.outward, offset + 2.2) });
  }
  for (let i = 0; i < crosswalks.length; i++) for (let k2 = i + 1; k2 < crosswalks.length; k2++) {
    if (!obbOverlap(crosswalks[i].box, crosswalks[k2].box)) continue;
    add("warning", "marking.crosswalkOverlap", `Crosswalks on ${crosswalks[i].port} and ${crosswalks[k2].port} overlap`, { metrics: { portA: crosswalks[i].port, portB: crosswalks[k2].port }, repair: { op: "repairIntersection", id: name } });
  }
  for (const other of otherJunctions) {
    const d = distance(j.position, other.position);
    if (d < 8 && Math.abs((j.position.y ?? 0) - (other.position.y ?? 0)) < 0.5) add("error", "intersection.duplicate", `Junction duplicates ${other.id} within ${round(d)} m`, { metrics: { duplicateId: other.id, distance: round(d) }, repair: { op: "repairIntersection", id: name } });
    else if (d < 30) {
      const divides = j.connections.some((a) => other.connections.some((b) => {
        if (a.roadId === b.roadId) return true;
        const ra = map.roads.find((r) => r.id === a.roadId), rb = map.roads.find((r) => r.id === b.roadId);
        return !!ra && !!rb && isOneWay(ra) && isOneWay(rb) && !!ra.roadNameId && ra.roadNameId === rb.roadNameId;
      }));
      if (divides) add("warning", "intersection.closePair", `Junction is ${round(d)} m from ${other.id}; likely one logical intersection`, { metrics: { otherId: other.id, distance: round(d) }, repair: { op: "repairIntersection", id: name } });
    }
  }
  return issues;
}
function corridorIndex(map) {
  const index = /* @__PURE__ */ new Map();
  for (const corridor of map.editing?.corridors ?? []) for (const id of corridor.roadIds) {
    const list = index.get(id) ?? [];
    list.push(corridor.id);
    index.set(id, list);
  }
  return index;
}
function checkEndpoints(rows, map) {
  const issues = [];
  const used = /* @__PURE__ */ new Set();
  for (const j of map.intersections) for (const c of j.connections) used.add(`${c.roadId}:${c.end}`);
  for (const link of map.roadLinks ?? []) {
    used.add(`${link.from.roadId}:${link.from.end}`);
    used.add(`${link.to.roadId}:${link.to.end}`);
  }
  const endpoints = [];
  for (const row of rows) for (const end of ["start", "end"]) endpoints.push({ row, end, point: endpointOf(row, end), used: used.has(`${row.id}:${end}`) });
  for (const item of endpoints) {
    if (item.used) continue;
    const kind = roadFunction(item.row);
    const severity = kind === "expressway" || kind === "arterial" ? "warning" : "info";
    issues.push(roadIssue(severity, "topology.deadEnd", item.row, `Open ${item.end} endpoint; verify this is an intentional terminus`, { station: round(item.end === "start" ? 0 : polylineLength(roadPoints(item.row))), metrics: { end: item.end }, repair: void 0 }));
  }
  for (let i = 0; i < endpoints.length; i++) for (let k2 = i + 1; k2 < endpoints.length; k2++) {
    const a = endpoints[i], b = endpoints[k2];
    if (a.row.id === b.row.id || a.used || b.used) continue;
    const gap = distance(a.point, b.point);
    if (gap > 0.05 && gap < 3 && Math.abs((a.point.y ?? 0) - (b.point.y ?? 0)) < 0.5) {
      issues.push(roadIssue("warning", "topology.endpointGap", a.row, `${round(gap, 2)} m gap to ${b.row.id}:${b.end} without an explicit link`, { metrics: { otherRoadId: b.row.id, gap: round(gap, 2) } }));
    }
  }
  for (const row of rows) {
    const length = polylineLength(roadPoints(row));
    const ends = ["start", "end"].filter((end) => used.has(`${row.id}:${end}`)).length;
    if (length < 5) issues.push(roadIssue("warning", "topology.tinyFragment", row, `Road fragment is only ${round(length)} m long`, { metrics: { length: round(length), connectedEnds: ends }, repair: void 0 }));
    else if (length < 16 && ends === 2) issues.push(roadIssue("info", "topology.shortConnector", row, `Short connector between junctions (${round(length)} m)`, { metrics: { length: round(length) }, repair: void 0 }));
    if (row.markings !== false && length < 10 && ends < 2) issues.push(roadIssue("warning", "marking.fragmentMarkings", row, "Tiny road fragment still carries road markings", { metrics: { length: round(length) }, repair: void 0 }));
  }
  return issues;
}
function checkCrossings(rows, map, index) {
  const issues = [];
  for (const row of rows) {
    const pts = roadPoints(row);
    const nearby = /* @__PURE__ */ new Map();
    if (index) for (const id of index.query(bounds(pts, 60))) {
      const other = map.roads.find((r) => r.id === id);
      if (other) nearby.set(id, other);
    }
    else for (const other of map.roads) if (overlaps(bounds(pts, 60), bounds(roadPoints(other), 60))) nearby.set(other.id, other);
    for (const other of nearby.values()) {
      if (other.id === row.id || other.id < row.id) continue;
      const otherPoints = roadPoints(other);
      let handled = false;
      for (let i = 1; i < pts.length && !handled; i++) for (let k2 = 1; k2 < otherPoints.length && !handled; k2++) {
        const hit = segmentIntersection(pts[i - 1], pts[i], otherPoints[k2 - 1], otherPoints[k2]);
        if (!hit) continue;
        const a = pts[i - 1], b = pts[i], c = otherPoints[k2 - 1], d = otherPoints[k2];
        const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z;
        const den = ux * vz - uz * vx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / den, s = ((c.x - a.x) * uz - (c.z - a.z) * ux) / den;
        const ya = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, yb = (c.y ?? 0) + ((d.y ?? 0) - (c.y ?? 0)) * s;
        const kindA = roadFunction(row), kindB = roadFunction(other);
        if (Math.abs(ya - yb) < 0.5 && (kindA === "expressway" || kindB === "expressway" || kindA === "ramp" || kindB === "ramp")) {
          const junction = map.intersections.some((j) => j.connections.some((x) => x.roadId === row.id) && j.connections.some((x) => x.roadId === other.id));
          const link = (map.roadLinks ?? []).some((l) => [l.from.roadId, l.to.roadId].includes(row.id) && [l.from.roadId, l.to.roadId].includes(other.id));
          if (!junction && !link) issues.push(roadIssue("error", "topology.expresswayCrossing", row, `Controlled-access crossing with ${other.id} has no junction or link`, { metrics: { otherRoadId: other.id }, repair: void 0 }));
        } else if (Math.abs(ya - yb) > 0.5 && Math.abs(ya - yb) < 5.5) {
          issues.push(roadIssue("warning", "topology.lowClearance", row, `Crossing clearance with ${other.id} is ${round(Math.abs(ya - yb), 2)} m`, { metrics: { otherRoadId: other.id, clearance: round(Math.abs(ya - yb), 2) }, repair: void 0 }));
        }
        handled = true;
      }
    }
  }
  return issues;
}
function chooseScope(map, scope, index) {
  if (scope.full) return { label: "full", rows: map.roads, junctions: map.intersections };
  let rows = [], junctions = [], label = "";
  const byId = new Map(map.roads.map((r) => [r.id, r]));
  const junctionFor = (ids) => map.intersections.filter((j) => j.connections.some((c) => ids.has(c.roadId)));
  if (scope.roadId) {
    const row = byId.get(scope.roadId);
    if (!row) throw new Error(`Unknown road: ${scope.roadId}`);
    rows = [row];
    junctions = junctionFor(/* @__PURE__ */ new Set([row.id]));
    const p = roadPoints(row), area = bounds(p, 90);
    for (const j of map.intersections) if (overlaps(bounds([j.position], 1), area)) junctions.push(j);
    label = `road:${row.id}`;
  } else if (scope.corridorId) {
    const corridor = map.editing?.corridors.find((c) => c.id === scope.corridorId);
    if (!corridor) throw new Error(`Unknown corridor: ${scope.corridorId}`);
    rows = corridor.roadIds.map((id) => byId.get(id)).filter((r) => !!r);
    const ids = new Set(rows.map((r) => r.id));
    junctions = map.intersections.filter((j) => j.connections.some((c) => ids.has(c.roadId)) || rows.some((r) => overlaps(bounds(roadPoints(r), 1), bounds([j.position], 80))));
    label = `corridor:${corridor.id}`;
  } else if (scope.intersectionId) {
    const j = map.intersections.find((j2) => j2.id === scope.intersectionId);
    if (!j) throw new Error(`Unknown intersection: ${scope.intersectionId}`);
    rows = j.connections.map((c) => byId.get(c.roadId)).filter((r) => !!r);
    junctions = [j, ...map.intersections.filter((other) => other.id !== j.id && distance(other.position, j.position) < 90)];
    label = `intersection:${j.id}`;
  } else {
    const area = scope.bbox ?? (scope.center ? bounds([scope.center], scope.radius ?? 200) : void 0);
    if (!area) throw new Error("diagnose needs roadId, corridorId, intersectionId, bbox/center or full:true");
    const ids = new Set(index?.query(area) ?? map.roads.filter((r) => overlaps(bounds(roadPoints(r), 1), area)).map((r) => r.id));
    rows = map.roads.filter((r) => ids.has(r.id));
    junctions = map.intersections.filter((j) => overlaps(bounds([j.position], 1), area) || j.connections.some((c) => ids.has(c.roadId)));
    label = scope.bbox ? "bbox" : scope.center ? `center:${scope.center.x},${scope.center.z}` : "full";
  }
  const cap = 600;
  if (rows.length > cap) rows = rows.slice(0, cap);
  const rowIds = new Set(rows.map((r) => r.id));
  junctions = junctions.filter((j) => !j.connections.length || j.connections.some((c) => rowIds.has(c.roadId)) || scope.intersectionId === j.id);
  const seen = /* @__PURE__ */ new Set();
  junctions = junctions.filter((j) => seen.has(j.id) ? false : (seen.add(j.id), true));
  return { label, rows, junctions };
}
function diagnoseMap(map, scope = {}, options = {}) {
  const chosen = chooseScope(map, scope, options.index);
  const corridors = corridorIndex(map), issues = [];
  const add = (issue2) => {
    if (issue2.roadId && !issue2.corridorId) issue2.corridorId = corridors.get(issue2.roadId)?.[0];
    issues.push(issue2);
  };
  for (const row of chosen.rows) for (const issue2 of diagnoseRoad(row)) add(issue2);
  for (const issue2 of checkEndpoints(chosen.rows, map)) add(issue2);
  for (const issue2 of checkCrossings(chosen.rows, map, options.index)) add(issue2);
  for (const j of chosen.junctions) for (const issue2 of junctionMarkingIssues(j, map, map.intersections.filter((other) => other.id !== j.id && distance(other.position, j.position) < 60))) add(issue2);
  const seen = /* @__PURE__ */ new Set(), unique = [];
  for (const issue2 of issues) {
    const key = `${issue2.code}|${issue2.roadId ?? ""}|${issue2.intersectionId ?? ""}|${issue2.station ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue2);
  }
  const min = scope.minSeverity ? severityRank[scope.minSeverity] : 0;
  const codes = scope.codes?.length ? scope.codes : void 0;
  const filtered = unique.filter((issue2) => severityRank[issue2.severity] >= min && (!codes || codes.some((code) => issue2.code === code || issue2.code.startsWith(code.endsWith(".") ? code : code + ".") || issue2.code.startsWith(code))));
  filtered.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.code.localeCompare(b.code) || (a.station ?? 0) - (b.station ?? 0));
  const limit = Math.max(1, Math.min(scope.limit ?? 100, 1e3));
  const counts = { error: 0, warning: 0, info: 0, total: filtered.length, bySeverity: { error: 0, warning: 0, info: 0 }, byCode: {} };
  for (const issue2 of filtered) {
    counts[issue2.severity]++;
    counts.bySeverity[issue2.severity]++;
    counts.byCode[issue2.code] = (counts.byCode[issue2.code] ?? 0) + 1;
  }
  return {
    scope: chosen.label,
    revision: options.revision,
    coverage: { roadsChecked: chosen.rows.length, roadsTotal: map.roads.length, intersectionsChecked: chosen.junctions.length, intersectionsTotal: map.intersections.length },
    counts,
    issues: options.retainAllIssues ? filtered : filtered.slice(0, limit),
    truncated: !options.retainAllIssues && filtered.length > limit
  };
}
function pageDiagnosticReport(report, request = {}) {
  if (!Array.isArray(report.issues) || report.truncated || report.issues.length !== report.counts?.total)
    throw new Error("Diagnosis receipt is incomplete; paging requires a complete diagnose --out receipt");
  const offset = request.offset ?? 0, requestedLimit = request.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
    throw new Error("Diagnosis page requires a non-negative integer offset and a positive integer limit");
  const limit = Math.min(requestedLimit, 1e3);
  const min = request.minSeverity ? severityRank[request.minSeverity] : 0;
  const codes = request.codes?.length ? request.codes : void 0;
  const selected = report.issues.filter((issue2) => severityRank[issue2.severity] >= min && (!codes || codes.some((code) => issue2.code === code || issue2.code.startsWith(code.endsWith(".") ? code : code + ".") || issue2.code.startsWith(code))));
  const issues = selected.slice(offset, offset + limit), end = offset + issues.length;
  return {
    ...report,
    issues,
    truncated: issues.length !== selected.length,
    pagination: { offset, limit, total: selected.length, returned: issues.length, nextOffset: end < selected.length ? end : null }
  };
}

// src/editor/RoadRepair.ts
var R2 = Math.PI / 180;
var horizontal2 = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
var clamp2 = (value, min, max) => Math.max(min, Math.min(max, value));
var round2 = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
function stationTable(points) {
  const result = [0];
  for (let i = 1; i < points.length; i++) result.push(result[i - 1] + horizontal2(points[i - 1], points[i]));
  return result;
}
function rangePoints(points, stations3, start, end) {
  const at = (station) => ({ ...points[stations3.indexOf(station)] ?? sampleAt(points, station).point });
  return [at(start), ...points.filter((_, i) => stations3[i] > start && stations3[i] < end).map((p) => ({ ...p })), at(end)];
}
function replaceRange(points, stations3, start, end, replacement) {
  return [...points.filter((_, i) => stations3[i] < start), ...replacement, ...points.filter((_, i) => stations3[i] > end)].map((p) => ({ ...p }));
}
function sampleRange(points, from, to, step) {
  if (to - from < 0.2) return [sampleAt(points, from).point, sampleAt(points, to).point];
  const result = [];
  for (let d = from; d < to; d += step) result.push({ ...sampleAt(points, d).point });
  result.push({ ...sampleAt(points, to).point });
  return result;
}
function perpendicular(a, b, p) {
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length < 1e-6) return horizontal2(a, p);
  return Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / length;
}
function simplifyPoints(points, toleranceXZ = 0.25, toleranceY = 0.04) {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const keep = /* @__PURE__ */ new Set([0, points.length - 1]);
  const visit = (first, last) => {
    if (last <= first + 1) return;
    let index = -1, best = -1;
    const a = points[first], b = points[last];
    const span = Math.max(1e-6, horizontal2(a, b));
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const t = clamp2(((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (span * span), 0, 1);
      const xz = perpendicular(a, b, p);
      const y = Math.abs((p.y ?? 0) - ((a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t));
      const error = Math.max(xz / toleranceXZ, toleranceY > 0 ? y / toleranceY : 0);
      if (error > best) {
        best = error;
        index = i;
      }
    }
    if (best > 1 && index > 0) {
      keep.add(index);
      visit(first, index);
      visit(index, last);
    }
  };
  visit(0, points.length - 1);
  return [...keep].sort((a, b) => a - b).map((i) => ({ ...points[i] }));
}
function filletCorners(points, options = {}) {
  const result = points.map((p) => ({ ...p })), minAngle = (options.minAngleDegrees ?? 40) * R2, maxRadius = options.maxRadius ?? 40, step = options.step ?? 0.75;
  let filleted = 0;
  for (let pass = 0; pass < 24; pass++) {
    let index = -1, best = minAngle;
    for (let i = 1; i < result.length - 1; i++) {
      const a2 = result[i - 1], b2 = result[i], c2 = result[i + 1];
      const turn3 = Math.abs(turnAngle(a2, b2, c2));
      if (turn3 < best || turn3 > 150 * R2 || Math.min(horizontal2(a2, b2), horizontal2(b2, c2)) < 0.5) continue;
      best = turn3;
      index = i;
    }
    if (index < 0) break;
    const a = result[index - 1], b = result[index], c = result[index + 1];
    const l1 = horizontal2(a, b), l2 = horizontal2(b, c);
    const u1 = { x: (a.x - b.x) / l1, z: (a.z - b.z) / l1 }, u2 = { x: (c.x - b.x) / l2, z: (c.z - b.z) / l2 };
    const delta = Math.acos(clamp2(u1.x * u2.x + u1.z * u2.z, -1, 1));
    const turn2 = Math.PI - delta;
    if (turn2 < minAngle || turn2 > 150 * R2) break;
    let tangent = Math.min(l1, l2) * 0.8;
    let radius = tangent / Math.tan(turn2 / 2);
    if (!Number.isFinite(radius) || radius < 0.5) {
      result.splice(index, 1);
      continue;
    }
    if (radius > maxRadius) {
      radius = maxRadius;
      tangent = radius * Math.tan(turn2 / 2);
    }
    if (tangent > Math.min(l1, l2) * 0.9) {
      tangent = Math.min(l1, l2) * 0.9;
      radius = tangent / Math.tan(turn2 / 2);
    }
    const t1 = { x: b.x + u1.x * tangent, y: (b.y ?? 0) + ((a.y ?? 0) - (b.y ?? 0)) * (tangent / l1), z: b.z + u1.z * tangent };
    const t2 = { x: b.x + u2.x * tangent, y: (b.y ?? 0) + ((c.y ?? 0) - (b.y ?? 0)) * (tangent / l2), z: b.z + u2.z * tangent };
    const bisectorLength = Math.hypot(u1.x + u2.x, u1.z + u2.z);
    if (bisectorLength < 1e-6) {
      result.splice(index, 1);
      continue;
    }
    const bx = (u1.x + u2.x) / bisectorLength, bz = (u1.z + u2.z) / bisectorLength;
    const distance2 = radius / Math.cos(turn2 / 2);
    const cx = b.x + bx * distance2, cz = b.z + bz * distance2;
    const startAngle = Math.atan2(t1.z - cz, t1.x - cx), endAngle = Math.atan2(t2.z - cz, t2.x - cx);
    const direction = Math.sign(turnAngle(a, b, c));
    let sweep = endAngle - startAngle;
    sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
    if (Math.sign(sweep) !== direction && Math.abs(sweep) > 1e-6) sweep = direction * (Math.PI * 2 - Math.abs(sweep));
    const count = Math.max(2, Math.ceil(Math.abs(sweep) * radius / step));
    const arc3 = [];
    for (let k2 = 0; k2 <= count; k2++) {
      const angle = startAngle + sweep * (k2 / count);
      const t = k2 / count;
      arc3.push({ x: cx + Math.cos(angle) * radius, y: (t1.y ?? 0) + ((t2.y ?? 0) - (t1.y ?? 0)) * t, z: cz + Math.sin(angle) * radius });
    }
    result.splice(index, 1, ...arc3);
    filleted++;
  }
  return { points: result, filleted };
}
function turnAngle(a, b, c) {
  const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x);
  return Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
}
function movingAverage2(points, radius) {
  const table = stationTable(points), result = [];
  for (let i = 0; i < points.length; i++) {
    let x = 0, z = 0, y = 0, count = 0;
    for (let k2 = 0; k2 < points.length; k2++) {
      if (Math.abs(table[k2] - table[i]) > radius) continue;
      x += points[k2].x;
      z += points[k2].z;
      y += points[k2].y ?? 0;
      count++;
    }
    result.push({ x: x / count, y: y / count, z: z / count });
  }
  return result;
}
function maxTurnDegrees(points) {
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    max = Math.max(max, Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) / R2);
  }
  return max;
}
function gradeMetrics(points) {
  const table = stationTable(points);
  let maxGrade2 = 0, reversals = 0, previous = 0;
  for (let i = 1; i < points.length; i++) {
    const length = table[i] - table[i - 1];
    if (length < 0.05) continue;
    const grade = ((points[i].y ?? 0) - (points[i - 1].y ?? 0)) / length;
    maxGrade2 = Math.max(maxGrade2, Math.abs(grade));
    if (Math.abs(grade) < 6e-3) continue;
    const sign = Math.sign(grade);
    if (previous && sign !== previous) reversals++;
    previous = sign;
  }
  return { maxGrade: maxGrade2, reversals };
}
function emptyMetrics(start, end) {
  return { beforeMaxGrade: 0, afterMaxGrade: 0, beforeGradeReversals: 0, afterGradeReversals: 0, removedControlPoints: 0, affectedStart: round2(start), affectedEnd: round2(end), maxDeviation: 0, maxHeightDelta: 0 };
}
function nearestOnPath(points, target) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? clamp2(((target.x - a.x) * dx + (target.z - a.z) * dz) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(target.x - a.x - dx * t, target.z - a.z - dz * t));
  }
  return best;
}
function maxHeightDelta(original, originalStations, repaired) {
  const originalHeights = original.map((p) => p.y ?? 0);
  let max = 0;
  for (const p of repaired) {
    const station = nearestStation(original, p);
    max = Math.max(max, Math.abs((p.y ?? 0) - profileAt(originalStations, originalHeights, station)));
  }
  return max;
}
function nearestStation(points, target) {
  const table = stationTable(points);
  let best = Infinity, station = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? clamp2(((target.x - a.x) * dx + (target.z - a.z) * dz) / l2, 0, 1) : 0;
    const d = Math.hypot(target.x - a.x - dx * t, target.z - a.z - dz * t);
    if (d < best) {
      best = d;
      station = table[i - 1] + Math.sqrt(l2) * t;
    }
  }
  return station;
}
function smoothAlignment(source2, options = {}) {
  const original = source2.map((p) => ({ ...p })), originalStations = stationTable(original);
  const length = polylineLength(original);
  const snap = (station) => originalStations.find((s) => Math.abs(s - station) < 0.05) ?? station;
  const start = snap(clamp2(options.start ?? 0, 0, length)), end = snap(clamp2(options.end ?? length, start, length));
  if (end - start < 1 || original.length < 3) return { points: original, metrics: emptyMetrics(start, end) };
  const preserve = start > 0 || end < length || options.preserveEndpoints !== false;
  const strength = clamp2(options.strength ?? 1, 0.1, 2.5);
  const tolerance = Math.max(0.05, options.simplifyTolerance ?? 0.8);
  const authoredRange = rangePoints(original, originalStations, start, end);
  const first = authoredRange[0], last = authoredRange.at(-1);
  const authoredInterior = authoredRange.slice(1, -1);
  const filleted = filletCorners([{ ...first }, ...authoredInterior, { ...last }], { minAngleDegrees: 40, maxRadius: 36, step: 0.75 });
  const filletLength = polylineLength(filleted.points);
  const range = sampleRange(filleted.points, 0, filletLength, 2);
  const smoothed = movingAverage2(range, clamp2(8 + strength * 10, 10, 35));
  const rangeTable = stationTable(smoothed);
  const taper = Math.min(8, Math.max(2, (end - start) / 8));
  for (let i = 1; i < smoothed.length - 1; i++) {
    const distanceFromEnd = Math.min(rangeTable[i], filletLength - rangeTable[i]);
    const weight = taper > 0 ? clamp2(distanceFromEnd / taper, 0, 1) : 1;
    const authoredStation = start + (end - start) * (rangeTable[i] / Math.max(1, filletLength));
    const authored = sampleAt(original, authoredStation).point;
    smoothed[i] = {
      x: authored.x + (smoothed[i].x - authored.x) * weight,
      y: (authored.y ?? 0) + ((smoothed[i].y ?? 0) - (authored.y ?? 0)) * weight,
      z: authored.z + (smoothed[i].z - authored.z) * weight
    };
  }
  if (preserve) {
    smoothed[0] = { ...first };
    smoothed[smoothed.length - 1] = { ...last };
  }
  const simplified = simplifyPoints(smoothed, tolerance, 0.06);
  const merged = replaceRange(original, originalStations, start, end, simplified);
  let maxDeviation = 0;
  for (const p of merged) maxDeviation = Math.max(maxDeviation, nearestOnPath(original, p));
  return {
    points: merged,
    metrics: {
      ...emptyMetrics(start, end),
      beforeMaxTurnDegrees: round2(maxTurnDegrees(original)),
      afterMaxTurnDegrees: round2(maxTurnDegrees(merged)),
      removedControlPoints: Math.max(0, original.length - merged.length),
      maxDeviation: round2(maxDeviation, 2),
      maxHeightDelta: round2(maxHeightDelta(original, originalStations, merged), 3)
    }
  };
}
function enforceMonotonic(values, increasing) {
  const result = values.slice(), start = values[0], end = values.at(-1);
  if (increasing ? start > end : start < end) return result;
  let previous = start;
  for (let i = 1; i < result.length - 1; i++) {
    result[i] = increasing ? clamp2(result[i], previous, end) : clamp2(result[i], end, previous);
    if (increasing && result[i] < previous) result[i] = previous;
    if (!increasing && result[i] > previous) result[i] = previous;
    previous = result[i];
  }
  let next = end;
  for (let i = result.length - 2; i > 0; i--) {
    result[i] = increasing ? clamp2(result[i], start, next) : clamp2(result[i], next, start);
    if (increasing && result[i] > next) result[i] = next;
    if (!increasing && result[i] < next) result[i] = next;
    next = result[i];
  }
  result[0] = start;
  result[result.length - 1] = end;
  return result;
}
function limitGrade(values, stations3, maxGrade2, preserve) {
  if (values.length < 2) return values.slice();
  const result = values.slice(), first = values[0], last = values.at(-1), count = result.length;
  if (preserve) {
    result[0] = first;
    result[count - 1] = last;
  }
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 1; i < (preserve ? count - 1 : count); i++) {
      const ds = Math.max(1e-6, stations3[i] - stations3[i - 1]);
      result[i] = clamp2(result[i], result[i - 1] - maxGrade2 * ds, result[i - 1] + maxGrade2 * ds);
    }
    for (let i = preserve ? count - 2 : count - 1; i >= 0; i--) {
      const ds = Math.max(1e-6, stations3[i + 1] - stations3[i]);
      result[i] = clamp2(result[i], result[i + 1] - maxGrade2 * ds, result[i + 1] + maxGrade2 * ds);
    }
    if (preserve) {
      result[0] = first;
      result[count - 1] = last;
    }
  }
  return result;
}
function profileAt(stations3, values, station) {
  if (station <= stations3[0]) return values[0];
  if (station >= stations3.at(-1)) return values.at(-1);
  for (let i = 1; i < stations3.length; i++) if (stations3[i] >= station) {
    const span = stations3[i] - stations3[i - 1] || 1;
    return values[i - 1] + (values[i] - values[i - 1]) * ((station - stations3[i - 1]) / span);
  }
  return values.at(-1);
}
function repairElevation(source2, options = {}) {
  const raw = source2.map((p) => ({ ...p })), rawStations = stationTable(raw);
  const length = polylineLength(raw);
  const start = clamp2(options.start ?? 0, 0, length), end = clamp2(options.end ?? length, start, length);
  if (end - start < 2 || raw.length < 2) return { points: raw, metrics: emptyMetrics(start, end) };
  if (start > 0 || end < length) {
    const interval = rangePoints(raw, rawStations, start, end);
    const repaired2 = repairElevation(interval, { ...options, start: void 0, end: void 0, preserveEndpoints: true });
    repaired2.points[0] = { ...interval[0] };
    repaired2.points[repaired2.points.length - 1] = { ...interval.at(-1) };
    return { points: replaceRange(raw, rawStations, start, end, repaired2.points), metrics: { ...repaired2.metrics, affectedStart: round2(start), affectedEnd: round2(end) } };
  }
  const preserve = options.preserveEndpoints !== false;
  const strength = clamp2(options.strength ?? 1, 0.1, 2.5);
  const samples = sampleRange(raw, start, end, 3), table = stationTable(samples);
  const heights = samples.map((p) => p.y ?? 0);
  const ambient = movingAverage2(samples, clamp2(20 + strength * 25, 24, 80)).map((p) => p.y ?? 0);
  let target = heights.map((value, i) => value + (ambient[i] - value) * clamp2(strength, 0, 1));
  const before = gradeMetrics(raw);
  if (preserve && target.length > 1) {
    target[0] = heights[0];
    target[target.length - 1] = heights.at(-1);
  }
  const net = target.at(-1) - target[0];
  const monotonic = options.monotonic === true;
  if (monotonic) target = enforceMonotonic(target, net >= 0);
  if (preserve && target.length > 1) {
    target[0] = heights[0];
    target[target.length - 1] = heights.at(-1);
  }
  const averageGrade = Math.abs(net) / Math.max(1, end - start);
  let maxGrade2 = Math.max(0.01, options.maxGrade ?? 0.08);
  let note;
  if (averageGrade > maxGrade2) {
    note = `endpoint delta requires ${(averageGrade * 100).toFixed(1)}% average grade`;
    maxGrade2 = Math.max(maxGrade2, averageGrade * 1.03);
  }
  target = limitGrade(target, table, maxGrade2, preserve);
  const repaired = raw.map((p, i) => {
    const station = rawStations[i];
    if (station < start || station > end) return { ...p };
    return { ...p, y: profileAt(table, target, station - start) };
  });
  const authoredHeights = limitGrade(repaired.map((p) => p.y ?? 0), rawStations, maxGrade2, preserve);
  for (let i = 0; i < repaired.length; i++) repaired[i] = { ...repaired[i], y: authoredHeights[i] };
  let simplified = simplifyPoints(repaired, 0.02, Math.max(5e-3, options.simplifyTolerance ?? 0.02));
  const simplifiedStations = stationTable(simplified);
  const simplifiedHeights = limitGrade(simplified.map((p) => p.y ?? 0), simplifiedStations, maxGrade2, preserve);
  simplified = simplified.map((p, i) => ({ ...p, y: simplifiedHeights[i] }));
  const after = gradeMetrics(simplified);
  let delta = 0;
  for (const p of simplified) {
    const station = nearestStation(raw, p);
    delta = Math.max(delta, Math.abs((p.y ?? 0) - profileAt(rawStations, raw.map((q) => q.y ?? 0), station)));
  }
  return {
    points: simplified,
    metrics: {
      ...emptyMetrics(start, end),
      beforeMaxGrade: round2(before.maxGrade * 100, 1),
      afterMaxGrade: round2(after.maxGrade * 100, 1),
      beforeGradeReversals: before.reversals,
      afterGradeReversals: after.reversals,
      removedControlPoints: Math.max(0, raw.length - simplified.length),
      maxHeightDelta: round2(delta, 3),
      monotonic,
      note
    }
  };
}
function cubicHandles(points) {
  if (points.length < 2) throw new Error("Ramp needs at least two points");
  const a = points[0], b = points.at(-1);
  const span = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const startSample = sampleAt(points, Math.min(12, span * 0.25));
  const endSample = sampleAt(points, Math.max(0, polylineLength(points) - Math.min(12, span * 0.25)));
  const handle = Math.max(12, span * 0.3);
  return [
    { ...a },
    { x: a.x + startSample.tangent.x * handle, y: a.y, z: a.z + startSample.tangent.z * handle },
    { x: b.x - endSample.tangent.x * handle, y: b.y, z: b.z - endSample.tangent.z * handle },
    { ...b }
  ];
}

// src/editor/MapObjectGeometry.ts
var dimensions = { residential_low: [20, 9.4, 16], residential_mid: [26, 23.4, 20], office: [26, 38.4, 22], commercial: [42, 9.4, 30], industrial: [46, 11.4, 30], school: [42, 14.4, 18], garage: [22, 5.4, 16], tree: [0.5, 6.8, 0.5], streetlight: [0.24, 7.5, 0.24], streetlight_dual: [0.3, 10, 0.3], streetlight_highway: [0.3, 12, 0.3], streetlight_small: [0.3, 5, 0.3], guardrail: [10, 1.1, 0.2], noise_barrier: [20, 3.5, 0.3], stadium: [132, 12.1, 92], parking: [30, 0, 24], water: [20, 0.04, 20], waterway: [12, 0.04, 20], railway_track: [10, 0.25, 40], station_platform: [8.5, 4.8, 20], sports_field: [100, 0.05, 60], traffic_sign: [0.16, 2.85, 0.16], bus_stop: [6.4, 2.8, 2.6], green_strip: [20, 0.04, 8], hardscape: [40, 0.04, 30], embankment: [20, 3, 10], guide_sign: [5.8, 5.4, 0.2], parked_car: [1.8, 1.7, 4.3] };
function objectSize(object) {
  const [w, h, d] = dimensions[object.prefabId] ?? [10, 10, 10], s = object.scale ?? { x: 1, y: 1, z: 1 };
  return { width: w * s.x, height: h * s.y, depth: d * s.z, approximate: true, ...object.prefabId === "tree" ? { trunkRadius: 0.25 * Math.max(s.x, s.z), canopyRadius: 2.1 * Math.max(s.x, s.z) } : {} };
}
function objectBounds(object) {
  const size = objectSize(object), c = Math.abs(Math.cos(object.rotation)), s = Math.abs(Math.sin(object.rotation)), extent = Math.max(c * size.width + s * size.depth, s * size.width + c * size.depth) / 2;
  return bounds([object.position], extent);
}

// src/editor/MapAnalysis.ts
var MAP_REVIEW_LIMITS = {
  clearance: 5.5,
  deckThickness: 0.65,
  localExtremumLength: 100,
  localExtremumAmplitude: 0.08,
  constraintDistance: 20,
  gradeDelta: 0.04,
  accessLength: 300,
  accessWidth: 80,
  interchangeDistance: 80,
  attachmentSpacing: 60,
  rampDistance: 8,
  objectRoadside: 2,
  facingTolerance: Math.PI / 4,
  junctionObjectMargin: 2,
  streetlightSpacing: 8,
  rampJunctionDistance: 15
};
var angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function stations2(points) {
  const result = [0];
  for (let i = 1; i < points.length; i++) result.push(result[i - 1] + distance(points[i - 1], points[i]));
  return result;
}
function structureType(road) {
  if (road.structure?.enclosure) return road.structure.enclosure.kind === "cutting" ? "depressed" : "tunnel";
  if (road.corridorSection === "GROUND") return "at_grade";
  if (road.corridorSection === "BRIDGE") return "elevated";
  const path = roadPoints(road);
  return path.some((p) => (p.y ?? 0) > 2) ? "elevated" : path.some((p) => (p.y ?? 0) < -1) ? "depressed" : "at_grade";
}
function issue(code, entity, message, metrics = {}, extra = {}) {
  return { id: [code, entity.roadId ?? "", entity.objectId ?? "", entity.intersectionId ?? "", entity.station?.toFixed(2) ?? ""].join(":"), code, severity: "warning", ...entity, message, metrics, ...extra };
}
var MapAnalysisContext = class {
  constructor(map, limits = {}) {
    this.map = map;
    this.limits = { ...MAP_REVIEW_LIMITS, ...limits };
    for (const r of map.roads) {
      const path = roadPoints(r);
      this.roads.set(r.id, r);
      this.paths.set(r.id, path);
      this.spatial.set("road:" + r.id, bounds(path, Math.max(-roadEdges(r).left, roadEdges(r).right)));
    }
    for (const j of map.intersections) {
      this.junctions.set(j.id, j);
      this.spatial.set("junction:" + j.id, bounds([j.position], Math.max(40, ...(j.pavementFootprint ?? []).map((p) => Math.hypot(p.x, p.z)))));
    }
    for (const o of map.objects) this.spatial.set("object:" + o.id, objectBounds(o));
    for (const s of map.signs ?? []) this.spatial.set("object:" + s.id, bounds([s.position], 6));
  }
  map;
  spatial = new EditorSpatialIndex();
  roads = /* @__PURE__ */ new Map();
  paths = /* @__PURE__ */ new Map();
  junctions = /* @__PURE__ */ new Map();
  crossingCache = /* @__PURE__ */ new Map();
  overlapCache = /* @__PURE__ */ new Map();
  limits;
  road(id) {
    const r = this.roads.get(id);
    if (!r) throw new Error("Unknown road " + id);
    return r;
  }
  path(id) {
    this.road(id);
    return this.paths.get(id);
  }
  roadCandidates(area) {
    return this.spatial.query(area).filter((id) => id.startsWith("road:")).map((id) => this.road(id.slice(5)));
  }
  nearRoads(point, radius = 50) {
    return this.roadCandidates(bounds([point], radius)).map((road) => ({ road, ...project(this.path(road.id), point) })).filter((p) => p.distance <= radius).sort((a, b) => a.distance - b.distance);
  }
  scopeArea(scope) {
    if (scope.bbox) return scope.bbox;
    if (scope.center) return bounds([scope.center], scope.radius ?? 100);
    if (scope.roadId) return bounds(this.path(scope.roadId), scope.radius ?? 30);
    if (scope.intersectionId) {
      const j = this.map.intersections.find((j2) => j2.id === scope.intersectionId);
      if (!j) throw new Error("Unknown intersection " + scope.intersectionId);
      return bounds([j.position], scope.radius ?? 50);
    }
    if (scope.objectId) {
      const o = [...this.map.objects, ...this.map.signs ?? []].find((o2) => o2.id === scope.objectId);
      if (!o) throw new Error("Unknown object " + scope.objectId);
      return bounds([o.position], scope.radius ?? 50);
    }
    return void 0;
  }
  selectedRoads(scope) {
    const area = this.scopeArea(scope), corridor = scope.corridorId && this.map.editing?.corridors.find((c) => c.id === scope.corridorId);
    if (scope.corridorId && !corridor) throw new Error("Unknown corridor " + scope.corridorId);
    if (!area && !corridor && !scope.full) throw new Error("A local scope or explicit full:true is required");
    return (area ? this.roadCandidates(area) : this.map.roads).filter((r) => (!scope.roadId || r.id === scope.roadId) && (!corridor || corridor.roadIds.includes(r.id)) && (!scope.district || r.district === scope.district) && (!scope.structure || structureType(r) === scope.structure));
  }
  crossings(id) {
    let list = this.crossingCache.get(id);
    if (!list) {
      list = this.computeCrossings(id);
      this.crossingCache.set(id, list);
    }
    return list;
  }
  overUnderRoads(id) {
    const cached = this.overlapCache.get(id);
    if (cached) return cached;
    const path = this.path(id), length = polylineLength(path), edges = roadEdges(this.road(id)), half = Math.max(-edges.left, edges.right), table = stations2(path), result = [];
    const exact = new Set(this.crossings(id).map((c) => c.roadId));
    for (const other of this.roadCandidates(bounds(path, half))) if (other.id !== id && !exact.has(other.id)) {
      const otherPath = this.path(other.id), otherEdges = roadEdges(other), reach = half + Math.max(-otherEdges.left, otherEdges.right), candidates = new Set(table);
      for (let station = 0; station < length; station += Math.max(10, length / 1e4)) candidates.add(station);
      for (const p of otherPath) {
        const hit = project(path, p);
        if (hit.distance <= reach) candidates.add(hit.along);
      }
      const hits = [...candidates].sort((a, b) => a - b).map((station) => {
        const point = sampleAt(path, station).point, hit = project(otherPath, point);
        return { station, point, distance: hit.distance, otherY: hit.point.y ?? 0, delta: (point.y ?? 0) - (hit.point.y ?? 0) };
      }).filter((h) => h.distance < reach && Math.abs(h.delta) > 0.5);
      if (hits.length) {
        const worst = hits.reduce((a, b) => Math.abs(a.delta) < Math.abs(b.delta) ? a : b);
        result.push({ roadId: other.id, startStation: hits[0].station, endStation: hits.at(-1).station, station: worst.station, point: worst.point, otherY: worst.otherY, clearance: Math.abs(worst.delta) - this.limits.deckThickness, relation: worst.delta > 0 ? "above" : "below", approximate: true });
      }
    }
    this.overlapCache.set(id, result);
    return result;
  }
  computeCrossings(id) {
    const path = this.path(id), result = [];
    for (const other of this.roadCandidates(bounds(path, 1))) if (other.id !== id) for (const hit of crossings(path, this.path(other.id))) {
      const gap = Math.abs((hit.point.y ?? 0) - hit.otherY), connected = gap < 0.2 && ((this.map.roadLinks ?? []).some((l) => {
        if (![l.from.roadId, l.to.roadId].includes(id) || ![l.from.roadId, l.to.roadId].includes(other.id)) return false;
        const p = this.path(l.from.roadId), end = p[l.from.end === "start" ? 0 : p.length - 1];
        return distance(end, hit.point) < 0.2;
      }) || this.map.intersections.some((j) => j.connections.some((c) => c.roadId === id) && j.connections.some((c) => c.roadId === other.id) && junctionSurfaceContains(j, this.map, hit.point, 0.2)));
      result.push({ roadId: other.id, station: project(path, hit.point).along, ...hit, clearance: gap - this.limits.deckThickness, requiredClearance: this.limits.clearance, connected });
    }
    return result;
  }
  hardConstraints(id) {
    const road = this.road(id), path = this.path(id), length = polylineLength(path);
    const result = [{ kind: "endpoint", station: 0, elevation: path[0].y ?? 0 }, { kind: "endpoint", station: length, elevation: path.at(-1).y ?? 0 }];
    for (const c of this.crossings(id)) if (!c.connected) result.push({ kind: "crossing", station: c.station, elevation: c.point.y ?? 0, roadId: c.roadId, requiredClearance: c.requiredClearance });
    for (const overlap of this.overUnderRoads(id)) for (const station of /* @__PURE__ */ new Set([overlap.startStation, overlap.station, overlap.endStation])) result.push({ kind: "overUnderEnvelope", station, elevation: sampleAt(path, station).point.y ?? 0, roadId: overlap.roadId, requiredClearance: this.limits.clearance });
    for (const j of this.map.intersections) for (const c of j.connections) if (c.roadId === id) result.push({ kind: "intersection", station: c.end === "start" ? 0 : length, elevation: path[c.end === "start" ? 0 : path.length - 1].y ?? 0, intersectionId: j.id });
    const table = stations2(path), kind = structureType(road);
    for (let i = 1; i < path.length - 1; i++) if (road.structure?.enclosure || kind === "elevated" && Math.abs((path[i].y ?? 0) - (path[i - 1].y ?? 0)) < 0.01 && Math.abs((path[i + 1].y ?? 0) - (path[i].y ?? 0)) < 0.01) result.push({ kind: road.structure?.enclosure ? "enclosure" : "bridgeDeck", station: table[i], elevation: path[i].y ?? 0 });
    return result.sort((a, b) => a.station - b.station);
  }
  envelope(id) {
    const road = this.road(id), path = this.path(id), edges = roadEdges(road);
    return { roadId: id, approximate: true, centerline: path, carriagewayWidth: road.laneCount * road.laneWidth, pavedEdges: edges, shoulders: road.shoulders ?? { left: 0, right: 0 }, roadsideStart: { left: edges.left - this.limits.objectRoadside, right: edges.right + this.limits.objectRoadside }, bbox: bounds(path, Math.max(-edges.left, edges.right)), structureType: structureType(road), junctions: this.map.intersections.filter((j) => j.connections.some((c) => c.roadId === id)).map((j) => ({ id: j.id, position: j.position, rotation: j.rotation, pavement: j.pavementFootprint ?? null, approximate: !j.pavementFootprint })) };
  }
};
var contexts = /* @__PURE__ */ new WeakMap();
function analysisContext(map) {
  let c = contexts.get(map);
  if (!c) {
    c = new MapAnalysisContext(map);
    contexts.set(map, c);
  }
  return c;
}
function invalidateAnalysis(map) {
  contexts.delete(map);
  invalidateRoadClearance(map);
}

// src/editor/RoadProfileAnalysis.ts
function inspectProfile(context, id, step = 10) {
  if (!Number.isFinite(step) || step <= 0) throw new Error("Profile step must be positive");
  const road = context.road(id), path = context.path(id), table = stations2(path), length = polylineLength(path), constraints = context.hardConstraints(id);
  if (length / step > 1e4) throw new Error("Profile exceeds 10000 samples; increase step");
  const positions = new Set(table);
  for (let s = 0; s < length; s += step) positions.add(s);
  positions.add(length);
  const ordered = [...positions].sort((a, b) => a - b).filter((value, i, array) => i === 0 || value - array[i - 1] > 1e-6), samples = ordered.map((station) => ({ station, xyz: sampleAt(path, station).point, elevation: sampleAt(path, station).point.y ?? 0, grade: 0, gradeDelta: 0 }));
  for (let i = 1; i < samples.length; i++) {
    samples[i].grade = (samples[i].elevation - samples[i - 1].elevation) / Math.max(1e-8, samples[i].station - samples[i - 1].station);
    samples[i].gradeDelta = samples[i].grade - (i > 1 ? samples[i - 1].grade : samples[i].grade);
  }
  const extrema = [];
  let previousGrade = 0, previousSegment = 1;
  for (let i = 1; i < path.length; i++) {
    const after = ((path[i].y ?? 0) - (path[i - 1].y ?? 0)) / Math.max(1e-3, table[i] - table[i - 1]);
    if (Math.abs(after) < 1e-3) continue;
    const before = previousGrade, prior = previousSegment;
    previousGrade = after;
    previousSegment = i;
    if (before * after >= 0 || before === 0) continue;
    const a = path[prior - 1], p = path[i - 1], b = path[i];
    const station = table[i - 1], span = table[i] - table[prior - 1], baseline = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * (station - table[prior - 1]) / Math.max(1e-3, span);
    const hard = constraints.filter((c) => c.kind !== "endpoint"), nearest = hard.length ? Math.min(...hard.map((c) => Math.abs(c.station - station))) : Infinity;
    extrema.push({ station, elevation: p.y ?? 0, kind: before > 0 ? "crest" : "sag", amplitude: Math.abs((p.y ?? 0) - baseline), wavelength: span, constraintDriven: nearest <= context.limits.constraintDistance, nearestHardConstraintDistance: Number.isFinite(nearest) ? nearest : null });
  }
  const spacings = extrema.slice(1).map((p, i) => p.station - extrema[i].station);
  return {
    roadId: id,
    length,
    isRamp: roadFunction(road) === "ramp",
    structureType: structureType(road),
    units: { station: "m", grade: "m/m", gradeDelta: "m/m" },
    samples,
    verticalControlPoints: road.centerline.map((xyz) => ({ station: project(path, xyz).along, xyz, authored: true })),
    endpointElevation: { start: path[0].y ?? 0, end: path.at(-1).y ?? 0 },
    constraints,
    crossings: context.crossings(id),
    nearbyOverUnderRoads: context.overUnderRoads(id),
    extrema,
    metrics: { extremaCount: extrema.length, shortExtremaCount: extrema.filter((e) => e.wavelength <= context.limits.localExtremumLength).length, maxGrade: Math.max(0, ...samples.map((s) => Math.abs(s.grade))), maxGradeDelta: Math.max(0, ...samples.map((s) => Math.abs(s.gradeDelta))), minimumExtremaSpacing: spacings.length ? Math.min(...spacings) : null, waveAmplitude: Math.max(0, ...extrema.map((e) => e.amplitude)), waveLength: extrema.length ? Math.max(...extrema.map((e) => e.wavelength)) : 0, nearestHardConstraintDistance: extrema.some((e) => e.nearestHardConstraintDistance !== null) ? Math.min(...extrema.flatMap((e) => e.nearestHardConstraintDistance === null ? [] : [e.nearestHardConstraintDistance])) : null }
  };
}
function profileIssues(context, id) {
  const p = inspectProfile(context, id), result = [];
  for (const e of p.extrema) if (e.wavelength <= context.limits.localExtremumLength && e.amplitude >= context.limits.localExtremumAmplitude) {
    result.push(issue(e.constraintDriven ? "vertical.constraintDrivenExtremum" : "vertical.localExtremum", { roadId: id, station: e.station }, e.constraintDriven ? "Extremum supports a hard crossing/structure constraint" : "Short local crest/sag is a repair candidate", { amplitude: e.amplitude, wavelength: e.wavelength, nearestHardConstraintDistance: e.nearestHardConstraintDistance }, { constraintDriven: e.constraintDriven, severity: e.constraintDriven ? "info" : "warning", ...e.constraintDriven ? {} : { repair: { op: "repairElevation", id, start: Math.max(0, e.station - e.wavelength / 2), end: Math.min(p.length, e.station + e.wavelength / 2), strategy: "smoothLocalExtremum" } } }));
  }
  return result;
}
function inspectHorizontal(context, id) {
  const road = context.road(id), path = context.path(id), table = stations2(path);
  const segments = path.slice(1).map((p, i) => ({ station: table[i], length: distance(path[i], p), heading: Math.atan2(p.x - path[i].x, -(p.z - path[i].z)) }));
  const turns = segments.slice(1).map((s, i) => ({ station: s.station, headingDelta: angleDelta(s.heading, segments[i].heading), curvature: angleDelta(s.heading, segments[i].heading) / Math.max(1e-3, (s.length + segments[i].length) / 2) }));
  const selfCrossings = [];
  for (let i = 1; i < path.length; i++) for (let k2 = i + 2; k2 < path.length; k2++) for (const c of crossings([path[i - 1], path[i]], [path[k2 - 1], path[k2]])) selfCrossings.push(c.point);
  return { roadId: id, controlPoints: road.centerline, segments, turns, maxHeadingDelta: Math.max(0, ...turns.map((t) => Math.abs(t.headingDelta))), selfCrossings, crossings: context.crossings(id), nearbyConflicts: context.roadCandidates(context.envelope(id).bbox).filter((r) => r.id !== id).map((r) => ({ roadId: r.id, distance: Math.min(...context.path(r.id).map((p) => project(path, p).distance)), approximate: true })), extrema: turns.filter((t, i) => i > 0 && t.headingDelta * turns[i - 1].headingDelta < 0) };
}
function repairConstrainedProfile(context, id, options) {
  const source2 = context.path(id), length = polylineLength(source2), sourceStations = stations2(source2);
  const snap = (station) => sourceStations.find((s) => Math.abs(s - station) < 0.05) ?? station;
  const start = snap(Math.max(0, options.start ?? 0)), end = snap(Math.min(length, options.end ?? length));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || start > length || end < 0) throw new Error("Invalid profile repair interval");
  const constraints = context.hardConstraints(id), anchors = [...options.anchors ?? []];
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.station) || anchor.station < start || anchor.station > end) throw new Error("Anchor lies outside repair interval");
    const existing = sampleAt(source2, anchor.station).point.y ?? 0;
    if (anchor.elevation !== void 0 && Math.abs(anchor.elevation - existing) > 1e-6) throw new Error("Hard anchors must preserve source elevation; use an explicit elevation edit for redesign");
  }
  const table = stations2(source2);
  const protectedStations = (station) => {
    const i = table.findIndex((s) => s >= station - 1e-8);
    if (i < 0) return [length];
    if (Math.abs(table[i] - station) < 1e-8) return [table[i]];
    return [table[Math.max(0, i - 1)], table[i]];
  };
  const cuts = [.../* @__PURE__ */ new Set([start, end, ...[...constraints, ...anchors].flatMap((c) => protectedStations(c.station)).filter((s) => s > start && s < end)])].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < source2.length; i++) if (table[i] < start) result.push({ ...source2[i] });
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i];
    const part = [sampleAt(source2, a).point, ...source2.filter((_, k2) => table[k2] > a && table[k2] < b), sampleAt(source2, b).point];
    let repaired;
    if (options.strategy === "fitBetweenConstraints") {
      const partTable2 = stations2(part);
      repaired = part.map((p, k2) => ({ ...p, y: (part[0].y ?? 0) + ((part.at(-1).y ?? 0) - (part[0].y ?? 0)) * (partTable2[k2] / Math.max(1e-3, b - a)) }));
    } else repaired = repairElevation(part, { ...options, start: void 0, end: void 0, preserveEndpoints: true, strength: options.strategy === "smoothGradeBreak" ? 0.7 : options.strength, monotonic: options.monotonic ?? options.strategy === "smoothLocalExtremum" }).points;
    const repairedTable = stations2(repaired), partTable = stations2(part);
    repaired = part.map((p, k2) => ({ ...p, y: sampleAt(repaired, Math.min(repairedTable.at(-1), partTable[k2])).point.y ?? 0 }));
    repaired[0] = { ...part[0] };
    repaired[repaired.length - 1] = { ...part.at(-1) };
    result.push(...(i === 1 ? repaired : repaired.slice(1)).map((p) => ({ ...p })));
  }
  result.push(...source2.filter((_, i) => table[i] > end).map((p) => ({ ...p })));
  const afterMap = { ...context.map, roads: context.map.roads.map((r) => r.id === id ? { ...r, centerline: result, curve: "polyline", elevationMode: "custom" } : r) }, after = new MapAnalysisContext(afterMap);
  const beforeProfile = inspectProfile(context, id), afterProfile = inspectProfile(after, id);
  for (const c of constraints) if (c.station >= start && c.station <= end && Math.abs((sampleAt(result, c.station).point.y ?? 0) - c.elevation) > 1e-6) throw new Error("Profile repair violates " + c.kind + " anchor");
  return { points: result, metrics: { before: beforeProfile.metrics, after: afterProfile.metrics, affectedStart: start, affectedEnd: end, preservedConstraints: constraints.length, strategy: options.strategy ?? "smoothWave" } };
}

// src/editor/RampAnalysis.ts
function inspectRamp(context, id) {
  const metadata = context.map.editing?.ramps.find((r) => r.id === id || r.roadId === id), road = context.road(metadata?.roadId ?? id), path = context.path(road.id);
  if (roadFunction(road) !== "ramp" && !metadata) throw new Error("Road is not a ramp: " + id);
  const ends = [path[0], path.at(-1)];
  const connections = (context.map.roadLinks ?? []).filter((l) => l.from.roadId === road.id || l.to.roadId === road.id).map((l) => l.from.roadId === road.id ? l.to : l.from);
  const sourceId = metadata?.from.roadId ?? connections[0]?.roadId, targetId = metadata?.to.roadId ?? connections[1]?.roadId;
  const source2 = sourceId ? context.roads.get(sourceId) : void 0, target = targetId ? context.roads.get(targetId) : void 0;
  const access = [source2, target].some((r) => r && roadFunction(r) === "frontage") && [source2, target].some((r) => r && roadFunction(r) === "expressway");
  const neighbours = context.roadCandidates(bounds(path, context.limits.interchangeDistance * 2)).filter((r) => r.id !== road.id && roadFunction(r) === "ramp").map((r) => {
    const other = context.path(r.id), crossing = context.crossings(road.id).find((c) => c.roadId === r.id), separation = crossing ? 0 : Math.min(...path.map((p) => project(other, p).distance), ...other.map((p) => project(path, p).distance));
    const otherMeta = context.map.editing?.ramps.find((m) => m.roadId === r.id), related = [otherMeta?.from.roadId, otherMeta?.to.roadId].flatMap((key) => key ? [context.roads.get(key)] : []);
    const role = related.some((r2) => r2 && roadFunction(r2) === "frontage") ? "frontageAccess" : "interchange";
    const closest = path.reduce((a, p) => project(other, p).distance < project(other, a).distance ? p : a, path[0]);
    return { roadId: r.id, distance: separation, verticalSeparation: crossing ? Math.abs((crossing.point.y ?? 0) - crossing.otherY) : Math.abs((closest.y ?? 0) - (project(other, closest).point.y ?? 0)), role, approximate: true };
  }).sort((a, b) => a.distance - b.distance);
  const nearestJunction = context.map.intersections.map((j) => ({ id: j.id, distance: project(path, j.position).distance })).sort((a, b) => a.distance - b.distance)[0] ?? null;
  const mainline = [source2, target].find((r) => r && roadFunction(r) === "expressway");
  const attachments = mainline ? context.roadCandidates(bounds(context.path(mainline.id), 30)).filter((r) => r.id !== road.id && roadFunction(r) === "ramp").flatMap((r) => [context.path(r.id)[0], context.path(r.id).at(-1)].map((p) => ({ roadId: r.id, ...project(context.path(mainline.id), p) })).filter((p) => p.distance < 25)).map((p) => ({ roadId: p.roadId, station: p.along, distance: Math.min(...ends.map((e) => Math.abs(project(context.path(mainline.id), e).along - p.along))) })) : [];
  return { roadId: road.id, sourceRoadId: sourceId ?? null, targetRoadId: targetId ?? null, role: access ? "frontageAccess" : "interchange", kind: metadata?.kind ?? null, mergeDiverge: metadata?.kind === "on" ? "merge" : metadata?.kind === "off" ? "diverge" : "reviewRequired", length: polylineLength(path), horizontal: inspectHorizontal(context, road.id), profile: inspectProfile(context, road.id), nearestIntersection: nearestJunction, nearestInterchangeRamp: neighbours.find((n) => n.role === "interchange") ?? null, nearestFrontageAccessRamp: neighbours.find((n) => n.role === "frontageAccess") ?? null, neighbourRamps: neighbours, crossings: context.crossings(road.id), attachments, metadata: metadata ?? null, reviewRequired: !metadata };
}
function rampIssues(context, id) {
  const ramp = inspectRamp(context, id), path = context.path(ramp.roadId), result = [], entity = { roadId: ramp.roadId };
  const add = (code, message, metrics) => result.push(issue(code, entity, message, metrics, { approximate: true, reviewRequired: true }));
  if (ramp.role === "frontageAccess") {
    if (ramp.length > context.limits.accessLength) add("ramp.accessTooLong", "Access ramp length exceeds review threshold", { actual: ramp.length, threshold: context.limits.accessLength });
    const span = distance(path[0], path.at(-1)), width = Math.max(...path.map((p) => project([path[0], path.at(-1)], p).distance));
    if (width > context.limits.accessWidth) add("ramp.accessTooWide", "Access ramp lateral excursion exceeds review threshold", { actual: width, threshold: context.limits.accessWidth, chordLength: span });
    if (ramp.nearestInterchangeRamp && ramp.nearestInterchangeRamp.distance < context.limits.interchangeDistance && ramp.nearestInterchangeRamp.verticalSeparation < context.limits.clearance) add("ramp.tooCloseToInterchange", "Access ramp is near an interchange ramp", { otherRoadId: ramp.nearestInterchangeRamp.roadId, actual: ramp.nearestInterchangeRamp.distance, threshold: context.limits.interchangeDistance });
  }
  for (const n of ramp.neighbourRamps) if (n.distance < context.limits.rampDistance && n.verticalSeparation < context.limits.clearance) add("ramp.overlapsRamp", "Ramp envelopes overlap or run close together", { otherRoadId: n.roadId, actual: n.distance, verticalSeparation: n.verticalSeparation, threshold: context.limits.rampDistance });
  for (const a of ramp.attachments) if (a.distance < context.limits.attachmentSpacing) add(ramp.kind === "on" ? "ramp.mergeTooClose" : "ramp.divergeTooClose", "Adjacent attachment spacing requires review", { otherRoadId: a.roadId, actual: a.distance, threshold: context.limits.attachmentSpacing });
  if (ramp.nearestIntersection && ramp.nearestIntersection.distance < context.limits.rampJunctionDistance && !context.map.intersections.find((j) => j.id === ramp.nearestIntersection.id)?.connections.some((c) => c.roadId === ramp.roadId)) add("ramp.conflictsWithIntersection", "Ramp runs near an unrelated junction", { intersectionId: ramp.nearestIntersection.id, actual: ramp.nearestIntersection.distance, threshold: context.limits.rampJunctionDistance });
  for (const c of ramp.crossings) if (!c.connected && c.clearance < context.limits.clearance) {
    const other = context.road(c.roadId);
    if (roadFunction(other) === "frontage") add("ramp.crossesFrontageJunction", "Ramp crosses frontage without safe clearance or explicit connection", { otherRoadId: c.roadId, station: c.station, clearance: c.clearance, required: c.requiredClearance });
  }
  if (ramp.metadata) for (const [end, attachment] of [["start", ramp.metadata.from], ["end", ramp.metadata.to]]) {
    const receiving = context.roads.get(attachment.roadId), point = path[end === "start" ? 0 : path.length - 1], target = receiving && context.path(receiving.id)[attachment.end === "start" ? 0 : context.path(receiving.id).length - 1];
    if (!target || distance(point, target) > 0.2 || Math.abs((point.y ?? 0) - (target.y ?? 0)) > 0.2) add(receiving && roadFunction(receiving) === "frontage" ? "ramp.badFrontageAttachment" : "ramp.badMainlineAttachment", "Ramp endpoint does not match its explicit XYZ attachment", { attachmentRoadId: attachment.roadId, actual: target ? Math.hypot(distance(point, target), (point.y ?? 0) - (target.y ?? 0)) : null, threshold: 0.2 });
  }
  return result;
}
function accessWindows(context, query) {
  if (query.corridorId) {
    const corridor = context.map.editing?.corridors.find((c) => c.id === query.corridorId);
    if (!corridor) throw new Error("Unknown corridor " + query.corridorId);
    const ids = corridor.roadIds.filter((id) => roadFunction(context.road(id)) === "expressway" && (!query.direction || context.road(id).travelDirection === "two-way" || context.road(id).travelDirection === query.direction));
    if (!ids.includes(query.mainline)) throw new Error("Mainline is outside requested corridor/direction");
    if (ids.length > 1) {
      const segments = ids.map((mainline) => ({ roadId: mainline, ...accessWindows(context, { ...query, mainline, corridorId: void 0 }) }));
      return { corridorId: query.corridorId, stationReference: "per-road; no artificial concatenation across disconnected segments", segments, events: segments.flatMap((s) => s.events.map((event) => ({ roadId: s.roadId, event }))), candidateWindows: segments.flatMap((s) => s.candidateWindows.map((window2) => ({ roadId: s.roadId, window: window2 }))), approximate: true, automaticDesign: false };
    }
  }
  const main = context.road(query.mainline), frontage = context.road(query.frontage), path = context.path(main.id), length = polylineLength(path);
  if (roadFunction(main) !== "expressway" || roadFunction(frontage) !== "frontage") throw new Error("Access windows require expressway mainline and frontage roads");
  if (query.corridorId && !context.map.editing?.corridors.find((c) => c.id === query.corridorId)?.roadIds.includes(main.id)) throw new Error("Mainline is outside requested corridor");
  const start = Math.max(0, query.start ?? 0), end = Math.min(length, query.end ?? length), buffer = query.buffer ?? context.limits.interchangeDistance, minLength = query.minLength ?? 80;
  if (!Number.isFinite(buffer) || buffer < 0 || !Number.isFinite(minLength) || minLength <= 0 || start >= end) throw new Error("Invalid access-window interval or thresholds");
  if (query.direction && main.travelDirection !== "two-way" && main.travelDirection !== query.direction) throw new Error("Requested direction differs from mainline travel direction");
  const events = [];
  for (const r of context.roadCandidates(bounds(path, buffer))) if (r.id !== main.id && r.id !== frontage.id) {
    if (roadFunction(r) === "ramp") for (const p of [context.path(r.id)[0], context.path(r.id).at(-1)]) {
      const hit = project(path, p);
      if (hit.distance <= buffer) events.push({ station: hit.along, kind: "rampAttachment", id: r.id, distance: hit.distance });
    }
  }
  for (const c of context.crossings(main.id)) events.push({ station: c.station, kind: c.clearance >= c.requiredClearance ? "gradeSeparatedCrossing" : "ordinaryCrossing", id: c.roadId, distance: 0 });
  for (const j of context.map.intersections) {
    const hit = project(path, j.position);
    if (hit.distance <= buffer) events.push({ station: hit.along, kind: "intersection", id: j.id, distance: hit.distance });
  }
  const blocks = events.map((e) => ({ start: Math.max(start, e.station - buffer), end: Math.min(end, e.station + buffer) })).filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const b of blocks) {
    const last = merged.at(-1);
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }
  const freeSpans = [];
  let cursor = start;
  for (const block of [...merged, { start: end, end }]) {
    if (block.start - cursor >= minLength) {
      const point = sampleAt(path, (cursor + block.start) / 2).point, interchanges = events.filter((e) => e.kind === "rampAttachment");
      freeSpans.push({ start: cursor, end: block.start, freeLength: block.start - cursor, nearestInterchangeDistance: interchanges.length ? Math.min(...interchanges.map((e) => Math.min(Math.abs(e.station - cursor), Math.abs(e.station - block.start)))) : null, frontageDistance: project(context.path(frontage.id), point).distance, approximate: true, reviewRequired: true });
    }
    cursor = Math.max(cursor, block.end);
  }
  return { mainline: main.id, frontage: frontage.id, direction: query.direction ?? main.travelDirection, stationRange: { start, end }, thresholds: { buffer, minLength }, events, excludedSpans: merged, freeSpans, candidateWindows: freeSpans, structures: [{ roadId: main.id, structure: main.structure ?? null }, { roadId: frontage.id, structure: frontage.structure ?? null }], automaticDesign: false };
}

// src/editor/ObjectAnalysis.ts
var isBuilding = (type) => ["residential_low", "residential_mid", "office", "commercial", "industrial", "school", "garage", "stadium"].includes(type);
function prefabRecord(o) {
  return { id: o.id, kind: "prefab", type: o.prefabId, position: o.position, rotation: o.rotation, derived: false, size: objectSize(o) };
}
var objectCaches = /* @__PURE__ */ new WeakMap();
var objectMaps = /* @__PURE__ */ new WeakMap();
function editableObjects(context) {
  const cached = objectCaches.get(context);
  if (cached) return cached;
  const records = context.map.objects.map(prefabRecord);
  for (const s of context.map.signs ?? []) records.push({ id: s.id, kind: "sign", type: "roadSign", position: s.position, rotation: s.heading, roadId: s.roadId, derived: false, size: { width: 0.5, depth: 0.5, height: s.mountHeight ?? 5.5, approximate: true } });
  for (const j of context.map.intersections) if (j.signalized) for (const c of j.connections) {
    try {
      const signal = signalApproach(context.map, j, c.port);
      if (!signal.incoming) continue;
      records.push({ id: `signal:${j.id}:${c.port}`, kind: "trafficLight", type: "trafficLight", position: signal.position, rotation: signal.heading, roadId: c.roadId, intersectionId: j.id, approach: c.port, derived: signal.derived, size: { width: 0.3, depth: 0.3, height: signal.height, approximate: true } });
    } catch {
    }
  }
  for (const o of records) if (o.kind === "trafficLight") context.spatial.set("object:" + o.id, bounds([o.position], 1));
  objectCaches.set(context, records);
  objectMaps.set(context, new Map(records.map((o) => [o.id, o])));
  return records;
}
function objectRecord(context, id) {
  editableObjects(context);
  const record = objectMaps.get(context).get(id);
  if (!record) throw new Error("Unknown editable object " + id);
  return record;
}
function nearbyObjects(context, area) {
  editableObjects(context);
  return context.spatial.query(area).filter((id) => id.startsWith("object:")).flatMap((id) => {
    const o = objectMaps.get(context).get(id.slice(7));
    return o ? [o] : [];
  });
}
function deriveAnchor(context, object, roadId) {
  const candidates = context.nearRoads(object.position, 100), explicit = roadId ?? object.roadId;
  const nearest = explicit ? { road: context.road(explicit), ...project(context.path(explicit), object.position) } : candidates.sort((a, b) => a.distance + Math.abs((a.point.y ?? 0) - (object.position.y ?? 0)) * 2 - (b.distance + Math.abs((b.point.y ?? 0) - (object.position.y ?? 0)) * 2))[0];
  if (!nearest) return null;
  const lateral = (object.position.x - nearest.point.x) * -nearest.tangent.z + (object.position.z - nearest.point.z) * nearest.tangent.x;
  const sign = context.map.signs?.find((s) => s.id === object.id), reverse = sign?.laneDirection === "reverse" || object.kind === "trafficLight" && context.junctions.get(object.intersectionId)?.connections.find((c) => c.port === object.approach)?.end === "start";
  const heading = Math.atan2(-nearest.tangent.x, -nearest.tangent.z) + (reverse ? Math.PI : 0);
  return { anchorRoadId: nearest.road.id, anchorIntersectionId: object.intersectionId ?? null, approach: object.approach ?? null, station: nearest.along, lateralOffset: lateral, verticalOffset: (object.position.y ?? 0) - (nearest.point.y ?? 0), facingDirection: reverse ? "reverse" : "forward", expectedHeading: heading, structureType: structureType(nearest.road), derived: true };
}
function inspectObject(context, id) {
  const object = objectRecord(context, id), anchor = deriveAnchor(context, object), roads = context.nearRoads(object.position, 80);
  const nearestIntersection = context.map.intersections.map((j) => ({ id: j.id, distance: distance(j.position, object.position) })).sort((a, b) => a.distance - b.distance)[0] ?? null;
  const road = anchor && context.road(anchor.anchorRoadId), nearestLane = road ? { roadId: road.id, index: Math.max(0, Math.min(road.laneCount - 1, Math.floor((anchor.lateralOffset + road.laneCount * road.laneWidth / 2) / road.laneWidth))), approximate: true } : null;
  let signal = null;
  if (object.kind === "trafficLight") signal = signalApproach(context.map, context.map.intersections.find((j) => j.id === object.intersectionId), object.approach);
  return { ...object, anchor, distanceToRoad: roads[0]?.distance ?? null, nearestLane, nearestIntersection, structureContext: roads.map((r) => ({ roadId: r.road.id, type: structureType(r.road), deckY: r.point.y ?? 0, verticalOffset: (object.position.y ?? 0) - (r.point.y ?? 0) })), signal, visibility: { approximate: true, reviewRequired: true, reason: "Envelope obstruction checks do not implement a renderer visibility test" }, issues: objectIssues(context, object) };
}
function queryObjects(context, scope = {}) {
  const area = context.scopeArea(scope), road = scope.roadId ? context.road(scope.roadId) : void 0, corridor = scope.corridorId ? context.map.editing?.corridors.find((c) => c.id === scope.corridorId) : void 0;
  if (!area && !scope.full && !scope.type && !corridor) throw new Error("Object query requires a local scope, type or explicit full:true");
  const spatialIds = area ? new Set(context.spatial.query(area).filter((id) => id.startsWith("object:")).map((id) => id.slice(7))) : null;
  const rows = editableObjects(context).filter((o) => (!spatialIds || spatialIds.has(o.id) || o.kind === "trafficLight" && o.position.x >= area.minX && o.position.x <= area.maxX && o.position.z >= area.minZ && o.position.z <= area.maxZ) && (!scope.objectId || o.id === scope.objectId) && (!scope.type || o.type === scope.type || scope.type === "streetlight" && o.type.startsWith("streetlight")) && (!scope.district || context.map.objects.find((p) => p.id === o.id)?.district === scope.district) && (!road || project(context.path(road.id), o.position).distance <= (scope.radius ?? 30)) && (!corridor || corridor.roadIds.some((id) => project(context.path(id), o.position).distance <= (scope.radius ?? 30))) && (!scope.center || distance(scope.center, o.position) <= (scope.radius ?? 100)));
  const offset = scope.offset ?? 0, limit = scope.limit ?? 100;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1e4) throw new Error("Object pagination requires offset>=0 and limit 1..10000");
  const exact = area ? rows.filter((o) => overlaps(bounds([o.position], Math.hypot(o.size.width, o.size.depth) / 2), area)) : rows;
  return { objects: exact.slice(offset, offset + limit).map((o) => ({ ...o, anchor: deriveAnchor(context, o) })), pagination: { offset, limit, total: exact.length, nextOffset: offset + limit < exact.length ? offset + limit : null } };
}
function objectIssues(context, object) {
  const result = [], entity = { objectId: object.id, ...object.roadId ? { roadId: object.roadId } : {}, ...object.intersectionId ? { intersectionId: object.intersectionId } : {} };
  const prefix = object.kind === "trafficLight" ? "trafficLight" : object.kind === "sign" ? "roadSign" : object.type.startsWith("streetlight") ? "streetlight" : object.type === "tree" ? "tree" : isBuilding(object.type) ? "building" : "object";
  const radius = object.size.trunkRadius ?? Math.hypot(object.size.width, object.size.depth) / 2, y = object.position.y ?? 0, top = y + object.size.height;
  const add = (code, message, metrics = {}, extra = {}) => result.push(issue(code, entity, message, metrics, { approximate: true, ...extra }));
  const nearby = context.nearRoads(object.position, radius + context.limits.objectRoadside + 30);
  const authoredSign = object.kind === "sign" ? context.map.signs?.find((s) => s.id === object.id) : void 0;
  const sign = authoredSign ? { ...authoredSign, position: object.position, heading: object.rotation } : void 0;
  const signShape = sign && signDimensions(sign.template, sign.size, sign.postOffset, sign.gantryPosts, sign.mountHeight);
  for (const hit of nearby) {
    const nx = -hit.tangent.z, nz = hit.tangent.x, c = Math.cos(object.rotation), s = Math.sin(object.rotation);
    const radius2 = object.size.trunkRadius ?? (Math.abs(nx * c - nz * s) * object.size.width + Math.abs(nx * s + nz * c) * object.size.depth) / 2;
    const alongRadius = object.size.trunkRadius ?? (Math.abs(hit.tangent.x * c - hit.tangent.z * s) * object.size.width + Math.abs(hit.tangent.x * s + hit.tangent.z * c) * object.size.depth) / 2;
    const road = hit.road, floor = hit.point.y ?? 0, edges = roadEdges(road), half = road.laneCount * road.laneWidth / 2, lateral = (object.position.x - hit.point.x) * -hit.tangent.z + (object.position.z - hit.point.z) * hit.tangent.x;
    const overrun = Math.abs((object.position.x - hit.point.x) * hit.tangent.x + (object.position.z - hit.point.z) * hit.tangent.z);
    if (overrun > alongRadius + 0.3) continue;
    if (sign && signShape) {
      const at = (x, z = 0) => {
        const p = rotatePoint({ x, z }, sign.heading);
        return { x: sign.position.x + p.x, z: sign.position.z + p.z };
      };
      let poleConflict = false, deckConflict = false;
      for (const x of signShape.posts) {
        const p = at(x, ROAD_SIGN_POST_Z), q = project(context.path(road.id), p), dy = q.point.y ?? 0;
        const side = (p.x - q.point.x) * -q.tangent.z + (p.z - q.point.z) * q.tangent.x;
        const beyond = Math.abs((p.x - q.point.x) * q.tangent.x + (p.z - q.point.z) * q.tangent.z);
        if (beyond > 0.5) continue;
        if (Math.abs(side) < half + 0.2 && (sign.postBaseY ?? y) <= dy + 0.3 && y + signShape.poleTop >= dy - 0.3) poleConflict = true;
        if (side >= edges.left - 0.2 && side <= edges.right + 0.2 && (sign.postBaseY ?? y) < dy - 0.65 && y + signShape.poleTop > dy - 0.65) deckConflict = true;
      }
      for (let x = -signShape.width / 2; x <= signShape.width / 2 + 0.01; x += Math.min(1, signShape.width / 2)) {
        const p = at(x), q = project(context.path(road.id), p), dy = q.point.y ?? 0;
        if (q.distance < Math.max(-edges.left, edges.right) && y + signShape.bottom < dy + 0.1 && y + signShape.bottom + signShape.height > dy - 0.65) deckConflict = true;
        if (q.distance < half + 0.1 && y + signShape.bottom < dy + 4.5 && y + signShape.bottom + signShape.height > dy) poleConflict = true;
      }
      if (poleConflict) add("roadSign.insideLane", "Sign support intersects carriageway", { roadId: road.id });
      if (deckConflict) add("roadSign.intersectsStructure", "Sign support/board crosses a road deck", { roadId: road.id, deckY: floor }, { reviewRequired: true });
      continue;
    }
    const intersectsFloor = y <= floor + 0.4 && top >= floor - context.limits.deckThickness, insidePaved = lateral >= edges.left - radius2 && lateral <= edges.right + radius2;
    if (intersectsFloor && Math.abs(lateral) < half + radius2) {
      const code = isBuilding(object.type) ? "building." + (road.roadClass === "ramp" ? "intersectsRamp" : "intersectsRoad") : prefix + "." + (prefix === "trafficLight" ? "insideCarriageway" : "insideLane");
      add(code, "Object envelope intersects carriageway", { roadId: road.id, distance: hit.distance, roadHalfWidth: half, objectRadius: radius2 }, { repair: { op: "reanchorObject", id: object.id, roadId: road.id, strategy: "moveOutsideCarriageway" } });
    }
    if (insidePaved && y < floor - context.limits.deckThickness && top > floor - context.limits.deckThickness) {
      add("object.intersectsRoadStructure", "Object crosses elevated deck envelope", { roadId: road.id, deckY: floor, objectTop: top });
      if (prefix === "roadSign" || prefix === "building") add(prefix + ".intersectsStructure", "Object intersects an elevated deck envelope", { roadId: road.id, deckY: floor }, { reviewRequired: true });
    }
    const enclosure = road.structure?.enclosure;
    if (enclosure && insidePaved && top > floor && y < floor + enclosure.clearance) {
      if (enclosure.kind !== "cutting" && (object.type === "tree" || object.type.startsWith("streetlight"))) add("structure.surfaceObjectInsideTunnel", "Surface vegetation or ordinary pole occupies a covered tunnel", { roadId: road.id, floor, ceiling: floor + enclosure.clearance });
      if (enclosure.kind !== "cutting" && top > floor + enclosure.clearance) add("object.intersectsRoadStructure", "Object crosses tunnel ceiling", { roadId: road.id, objectTop: top, ceiling: floor + enclosure.clearance });
    }
    if (road.structure?.barrierEnabled && Math.min(Math.abs(lateral - edges.left), Math.abs(lateral - edges.right)) < radius2 + 0.3 && y < floor + 1.1 && top > floor) add("object.intersectsBarrier", "Object intersects roadside barrier envelope", { roadId: road.id, lateralOffset: lateral });
    if (object.size.canopyRadius && intersectsFloor && hit.distance < half + object.size.canopyRadius && hit.distance >= half + radius2) add("tree.canopyNearRoad", "Canopy extends toward carriageway; trunk is clear", { roadId: road.id, canopyRadius: object.size.canopyRadius }, { severity: "info", reviewRequired: true });
  }
  const junctionCandidates = new Set(context.spatial.query(bounds([object.position], radius + 4)).filter((id) => id.startsWith("junction:")).map((id) => id.slice(9)));
  for (const id of junctionCandidates) {
    const j = context.junctions.get(id);
    if (y <= (j.position.y ?? 0) + 0.4 && top >= (j.position.y ?? 0) - 0.3) {
      if (junctionSurfaceContains(j, context.map, object.position, radius)) add(prefix === "trafficLight" ? "trafficLight.insideJunctionConflict" : isBuilding(object.type) ? "building.intersectsJunction" : prefix + ".insideJunction", "Object envelope intersects junction pavement", { intersectionId: j.id });
      else if (prefix === "roadSign" && junctionSurfaceContains(j, context.map, object.position, radius + 4)) add("roadSign.tooCloseToJunction", "Sign is immediately beside the junction conflict envelope", { intersectionId: j.id });
    }
  }
  const anchor = deriveAnchor(context, object);
  if ((object.kind === "sign" || object.kind === "trafficLight") && !anchor) add(prefix + ".unanchored", "No road/approach anchor within query radius");
  if (anchor && (object.kind === "sign" || object.kind === "trafficLight")) {
    const expected = object.kind === "trafficLight" ? signalApproach(context.map, context.map.intersections.find((j) => j.id === object.intersectionId), object.approach).expectedHeading : anchor.expectedHeading;
    const delta = Math.abs(angleDelta(object.rotation, expected));
    if (delta > context.limits.facingTolerance) add(prefix + ".wrongFacing", "Facing differs from incoming road tangent", { actual: object.rotation, expected, delta }, { repair: { op: "reanchorObject", id: object.id, strategy: "fixFacing" } });
    if (object.kind === "sign" && sign?.type !== "CHEVRON" && !["gantry", "highway-gantry", "ceiling"].includes(sign?.template ?? "") && (anchor.lateralOffset < 0 && anchor.facingDirection === "forward" || anchor.lateralOffset > 0 && anchor.facingDirection === "reverse")) add("roadSign.wrongSide", "Sign is on the opposite side of its served travel direction", { lateralOffset: anchor.lateralOffset });
    if (object.kind === "trafficLight") {
      const signal = signalApproach(context.map, context.map.intersections.find((j) => j.id === object.intersectionId), object.approach);
      const side = (object.position.x - signal.mouth.x) * signal.right.x + (object.position.z - signal.mouth.z) * signal.right.z;
      if (side < signal.roadWidth / 2) add("trafficLight.wrongSide", "Signal pole is not outside the incoming approach right edge", { lateralOffset: side, required: signal.roadWidth / 2 });
      if (side >= signal.roadWidth / 2 && side < signal.roadWidth / 2 + 0.75) add("trafficLight.tooCloseToLane", "Signal pole has inadequate lane-edge clearance", { actual: side - signal.roadWidth / 2, required: 0.75 });
    }
    const served = context.road(anchor.anchorRoadId), path = context.path(served.id), reverse = anchor.facingDirection === "reverse", viewer = sampleAt(path, Math.max(0, anchor.station + (reverse ? 30 : -30))).point;
    let blockedBy;
    for (let i = 1; i < 12 && !blockedBy; i++) {
      const t = i / 12, p = { x: viewer.x + (object.position.x - viewer.x) * t, y: (viewer.y ?? 0) + 1.2 + ((object.position.y ?? 0) + object.size.height - (viewer.y ?? 0) - 1.2) * t, z: viewer.z + (object.position.z - viewer.z) * t };
      for (const hit of context.nearRoads(p, 30)) if (hit.road.id !== served.id && hit.distance < hit.road.laneCount * hit.road.laneWidth / 2 && Math.abs((hit.point.y ?? 0) - (p.y ?? 0)) < context.limits.deckThickness) blockedBy = hit.road.id;
    }
    if (blockedBy) add(prefix === "trafficLight" ? "trafficLight.occludedByStructure" : "roadSign.occluded", "Approximate incoming sight ray intersects another deck", { roadId: blockedBy }, { reviewRequired: true });
  }
  return result;
}
function reanchorCommands(context, id, options = {}) {
  const object = objectRecord(context, id), anchor = deriveAnchor(context, object, options.roadId);
  if (!anchor) throw new Error("Cannot derive road anchor for " + id);
  const road = context.road(anchor.anchorRoadId), s = sampleAt(context.path(road.id), options.station ?? anchor.station), radius = object.size.trunkRadius ?? Math.hypot(object.size.width, object.size.depth) / 2;
  const edges = roadEdges(road), sign = object.kind === "sign" ? anchor.facingDirection === "reverse" ? -1 : 1 : anchor.lateralOffset < 0 ? -1 : 1, offset = options.lateralOffset ?? (sign < 0 ? edges.left - radius - context.limits.objectRoadside : edges.right + radius + context.limits.objectRoadside);
  const position = { x: s.point.x - s.tangent.z * offset, y: (s.point.y ?? 0) + (options.verticalOffset ?? 0), z: s.point.z + s.tangent.x * offset }, heading = anchor.expectedHeading;
  if (object.kind === "trafficLight") {
    const j = context.map.intersections.find((j2) => j2.id === object.intersectionId), signal = signalApproach(context.map, j, object.approach);
    return [{ op: "setSignalPlacement", intersectionId: j.id, approach: object.approach, position: options.strategy === "fixFacing" ? object.position : signal.expectedPosition, heading: signal.expectedHeading }];
  }
  if (object.kind === "sign") return [{ op: "modifySign", id, properties: { position: options.strategy === "fixFacing" ? object.position : position, heading, roadId: road.id, stationMetres: options.station ?? anchor.station } }];
  return [{ op: "modifyObject", id, properties: { position: options.strategy === "fixFacing" ? object.position : position, rotation: heading } }];
}

// src/editor/PlacementBrush.ts
function randomSource(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}
function insidePolygon(p, polygon) {
  let inside = false;
  for (let i = 0, k2 = polygon.length - 1; i < polygon.length; k2 = i++) {
    const a = polygon[i], b = polygon[k2];
    if (a.z > p.z !== b.z > p.z && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function brushPosition(context, request, station, side, random = () => 0.5) {
  if (!request.roadId) throw new Error("Road-semantic placement requires roadId");
  const road = context.road(request.roadId), path = context.path(road.id), edges = roadEdges(road), jitter = request.randomPositionJitter ?? 0;
  let s = sampleAt(path, station);
  const offset = side * ((side < 0 ? -edges.left : edges.right) + (request.lateralOffset ?? 2));
  let position = { x: s.point.x - s.tangent.z * offset + (random() - 0.5) * 2 * jitter, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset + (random() - 0.5) * 2 * jitter };
  if (request.snapMode === "roadside") {
    const hit = project(path, position);
    s = { point: hit.point, tangent: hit.tangent };
    position = { x: hit.point.x - hit.tangent.z * offset, y: hit.point.y, z: hit.point.z + hit.tangent.x * offset };
  }
  const mode2 = request.heightMode ?? (request.type === "tree" ? "GROUND" : "ROAD_SURFACE");
  const ground = context.map.regional ? regionalTerrainSampler(context.map).heightAt(position.x, position.z) : 0;
  let y = mode2 === "GROUND" ? ground : mode2 === "ABSOLUTE" ? request.height : mode2 === "SIDEWALK" ? (s.point.y ?? 0) + 0.15 : s.point.y ?? 0;
  if (y === void 0 || !Number.isFinite(y)) throw new Error("ABSOLUTE height mode requires finite height");
  if (mode2 === "STRUCTURE_DECK" && structureType(road) === "at_grade") throw new Error("STRUCTURE_DECK requires a structured road");
  position = { ...position, y: y + (request.heightOffset ?? 0) };
  const heading = Math.atan2(-s.tangent.x, -s.tangent.z), orientation = request.orientation ?? (request.type === "roadSign" || request.type === "trafficLight" ? "FACE_TRAFFIC" : "ROAD_FORWARD");
  let yaw = heading;
  if (orientation === "ROAD_BACKWARD" || orientation === "FACE_TRAFFIC" && request.direction === "reverse") yaw += Math.PI;
  if (orientation === "FACE_ROAD" || orientation === "NORMAL_TO_ROAD") yaw = Math.atan2(s.point.x - position.x, -(s.point.z - position.z));
  if (orientation === "FACE_INTERSECTION") {
    const j = context.map.intersections.find((j2) => j2.id === request.intersectionId);
    if (!j) throw new Error("FACE_INTERSECTION requires intersectionId");
    yaw = Math.atan2(j.position.x - position.x, -(j.position.z - position.z));
  }
  if (orientation === "ABSOLUTE") yaw = request.yaw ?? 0;
  else yaw += request.yaw ?? 0;
  yaw += (random() - 0.5) * 2 * (request.randomRotationJitter ?? 0);
  return { position, rotation: yaw, heightMode: mode2 };
}
function placementIssues(context, object, request = {}, planned = [], ignoredObjectIds = /* @__PURE__ */ new Set()) {
  const issues = objectIssues(context, object), anchor = deriveAnchor(context, object), radius = object.size.trunkRadius ?? Math.hypot(object.size.width, object.size.depth) / 2;
  const add = (code, message, metrics = {}) => issues.push({ id: code + ":" + object.id, code, severity: "warning", objectId: object.id, message, metrics, approximate: true });
  const y = object.position.y ?? 0;
  if (request.minDistanceToIntersection !== void 0) {
    const ids = context.spatial.query(bounds([object.position], request.minDistanceToIntersection));
    for (const key of ids) if (key.startsWith("junction:")) {
      const j = context.map.intersections.find((j2) => j2.id === key.slice(9));
      if (j.id !== object.intersectionId && distance(j.position, object.position) < request.minDistanceToIntersection && Math.abs((j.position.y ?? 0) - y) < 3) add("object.intersectionExclusion", "Object is within intersection exclusion radius", { intersectionId: j.id, distance: distance(j.position, object.position) });
    }
  }
  if (request.minDistanceToRamp) {
    for (const r of context.nearRoads(object.position, request.minDistanceToRamp)) if (r.road.roadClass === "ramp" && Math.abs((r.point.y ?? 0) - y) < 3) add("object.rampExclusion", "Object is within ramp exclusion radius", { roadId: r.road.id, distance: r.distance });
  }
  for (const other of [...nearbyObjects(context, bounds([object.position], radius + Math.max(request.minDistanceToObject ?? 2, object.type.startsWith("streetlight") ? context.limits.streetlightSpacing : object.size.canopyRadius ?? 0))).filter((o) => !ignoredObjectIds.has(o.id)), ...planned]) if (other.id !== object.id && Math.abs((other.position.y ?? 0) - y) < Math.max(object.size.height, other.size.height)) {
    const gap = distance(object.position, other.position), required = Math.max(request.minDistanceToObject ?? 1, radius + (other.size.trunkRadius ?? Math.hypot(other.size.width, other.size.depth) / 2));
    if (object.size.height > 0.1 && other.size.height > 0.1 && gap < required) add("object.tooCloseToObject", "Object envelopes overlap or violate spacing", { otherObjectId: other.id, actual: gap, required });
    if (object.type.startsWith("streetlight") && other.type.startsWith("streetlight") && gap < context.limits.streetlightSpacing) add("streetlight.tooDense", "Streetlight spacing is below review threshold", { otherObjectId: other.id, actual: gap, threshold: context.limits.streetlightSpacing });
    if (object.size.canopyRadius && (other.kind === "sign" || other.kind === "trafficLight") && gap < object.size.canopyRadius + 1) add("tree.canopyOccludesSign", "Canopy may obscure a sign/signal envelope", { otherObjectId: other.id, actual: gap, canopyRadius: object.size.canopyRadius });
    if (request.avoidTypes?.includes(other.type) && gap < Math.max(5, required)) add("object.avoidType", "Placement is near an excluded object type", { otherObjectId: other.id, type: other.type });
  }
  if (anchor) {
    const road = context.road(anchor.anchorRoadId), mode2 = request.heightMode ?? (object.kind === "prefab" && !["streetlight", "streetlight_dual", "streetlight_highway", "streetlight_small", "guardrail", "noise_barrier", "traffic_sign", "guide_sign", "parked_car", "bus_stop"].includes(object.type) ? "GROUND" : "ROAD_SURFACE");
    const ground = context.map.regional ? regionalTerrainSampler(context.map).heightAt(object.position.x, object.position.z) : 0;
    const expected = mode2 === "GROUND" ? ground : mode2 === "ABSOLUTE" ? request.height ?? y : sampleAt(context.path(road.id), anchor.station).point.y ?? 0;
    const target = expected + (request.heightOffset ?? 0) + (mode2 === "SIDEWALK" ? 0.15 : 0), delta = y - target;
    if (mode2 !== "ABSOLUTE" && Math.abs(delta) > 0.75) add(delta > 0 ? "object.floating" : "object.buried", "Base differs from selected support surface", { actual: y, expected: target, delta });
    if (object.kind === "prefab" && structureType(road) === "elevated" && mode2 !== "GROUND" && mode2 !== "ABSOLUTE") {
      const edges = roadEdges(road), sidewalk = road.sidewalk?.enabled ? road.sidewalk.width : 0;
      if (anchor.lateralOffset < edges.left - sidewalk || anchor.lateralOffset > edges.right + sidewalk) add("object.unsupportedOnDeck", "Road-level placement lies outside the available deck/sidewalk envelope", { roadId: road.id, lateralOffset: anchor.lateralOffset });
      if (object.type === "tree") add("tree.onBridgeDeck", "Vegetation brush must avoid elevated road decks", { roadId: road.id });
    }
    if (road.structure?.enclosure && mode2 !== "GROUND" && mode2 !== "ABSOLUTE") {
      const edges = roadEdges(road), sidewalk = road.sidewalk?.enabled ? road.sidewalk.width : 0;
      if ((anchor.lateralOffset < edges.left - sidewalk || anchor.lateralOffset > edges.right + sidewalk) && y < ground - 0.5) add("object.wrongStructureLevel", "Underground placement lies outside the supported floor envelope", { roadId: road.id, groundElevation: ground, actual: y });
    }
  }
  return issues;
}
function planBrush(context, request) {
  const modes = ["SINGLE", "LINE", "RANGE", "AREA", "REPLACE", "REPAIR"];
  if (!modes.includes(request.mode)) throw new Error("Unknown brush mode");
  if (request.pitch || request.roll) throw new Error("Existing map objects support yaw only; pitch and roll must be zero");
  if ((request.randomPositionJitter || request.randomRotationJitter || request.randomScaleJitter) && !Number.isInteger(request.seed)) throw new Error("Randomized brushes require an integer seed");
  const random = randomSource(request.seed ?? 0), policy = request.autoAdjust ?? (request.mode === "REPAIR" ? "ADJUST" : "SKIP"), maxMove = request.maxAutoMove ?? 5, limit = request.limit ?? 500;
  for (const key of ["spacing", "density", "stationStart", "stationEnd", "lateralOffset", "longitudinalOffset", "height", "heightOffset", "yaw", "randomPositionJitter", "randomRotationJitter", "randomScaleJitter", "minDistanceToIntersection", "minDistanceToRamp", "minDistanceToObject"]) if (request[key] !== void 0 && !Number.isFinite(request[key])) throw new Error("Brush " + key + " must be finite");
  if (!["STRICT", "SKIP", "ADJUST"].includes(policy)) throw new Error("Unknown autoAdjust policy");
  if (!["left", "right", "both"].includes(request.side ?? "right")) throw new Error("Unknown brush side");
  if (request.heightMode && !["GROUND", "ROAD_SURFACE", "ROAD_DECK", "SIDEWALK", "STRUCTURE_DECK", "ABSOLUTE", "RELATIVE"].includes(request.heightMode)) throw new Error("Unknown height mode");
  if (request.orientation && !["ROAD_FORWARD", "ROAD_BACKWARD", "FACE_TRAFFIC", "FACE_ROAD", "FACE_INTERSECTION", "NORMAL_TO_ROAD", "ABSOLUTE"].includes(request.orientation)) throw new Error("Unknown orientation mode");
  if (request.arrangement && !["ALIGNED", "STAGGERED"].includes(request.arrangement)) throw new Error("Unknown brush arrangement");
  if (!Number.isFinite(maxMove) || maxMove < 0 || !Number.isInteger(limit) || limit < 1 || limit > 5e3) throw new Error("Brush maxAutoMove must be nonnegative; limit must be 1..5000");
  if (!PREFAB_IDS.includes(request.type) && !["roadSign", "trafficLight"].includes(request.type)) throw new Error("Unknown brush object type");
  if (request.type === "roadSign" && (request.mode === "AREA" || request.randomPositionJitter || request.randomRotationJitter)) throw new Error("Directional signs require explicit road stations and deterministic facing");
  if (request.type === "trafficLight" && (!request.intersectionId || !["SINGLE", "REPLACE", "REPAIR"].includes(request.mode) || request.randomPositionJitter || request.randomRotationJitter)) throw new Error("Traffic light placement requires an intersection and semantic SINGLE/REPLACE/REPAIR mode");
  const candidates = [], planned = [], operations = [], ignored = /* @__PURE__ */ new Set(), used = /* @__PURE__ */ new Set([...editableObjects(context).map((o) => o.id), ...context.map.roads.map((r) => r.id), ...context.map.intersections.map((j) => j.id)]);
  const nextId = () => {
    let n = candidates.length + 1, id = `brush:${request.type}:${request.roadId ?? "area"}:${n}`;
    while (used.has(id)) id = `brush:${request.type}:${request.roadId ?? "area"}:${++n}`;
    used.add(id);
    return id;
  };
  const handle = (record, commands, sourceId, sourcePosition) => {
    const original = { ...sourcePosition ?? record.position };
    let checks = placementIssues(context, record, request, planned, ignored), reasons = [];
    if (sourcePosition && request.mode === "REPAIR" && Math.hypot(distance(original, record.position), (original.y ?? 0) - (record.position.y ?? 0)) > maxMove) checks.push({ id: "object.autoMoveExceeded:" + record.id, code: "object.autoMoveExceeded", severity: "warning", objectId: record.id, message: "Repair exceeds maxAutoMove", metrics: { maxAutoMove: maxMove } });
    const errors = () => checks.filter((i) => i.severity !== "info");
    const adjustmentRoadId = request.roadId ?? deriveAnchor(context, record)?.anchorRoadId;
    if (errors().length && policy === "ADJUST" && adjustmentRoadId) {
      const anchor = deriveAnchor(context, record, adjustmentRoadId);
      const transforms = [...[1, 2, 3, 5].map((lateral) => ({ lateral, stationDelta: 0 })), ...[-2, 2, -5, 5].map((stationDelta) => ({ lateral: 2, stationDelta })), { lateral: 0, stationDelta: 0 }];
      for (const transform of transforms) {
        const { lateral, stationDelta } = transform;
        if (Math.abs(stationDelta) > maxMove) continue;
        const side = anchor.lateralOffset < 0 ? -1 : 1, road = context.road(adjustmentRoadId), edges = roadEdges(road), offset = (side < 0 ? edges.left : edges.right) + side * ((record.size.trunkRadius ?? 0.5) + lateral);
        const at = sampleAt(context.path(road.id), Math.max(0, Math.min(polylineLength(context.path(road.id)), anchor.station + stationDelta)));
        const target = brushPosition(context, { ...request, roadId: adjustmentRoadId, randomPositionJitter: 0, randomRotationJitter: 0 }, anchor.station + stationDelta, side);
        const moved = lateral === 0 && stationDelta === 0 ? { ...record.position, y: target.position.y } : { x: at.point.x - at.tangent.z * offset, y: target.position.y, z: at.point.z + at.tangent.x * offset }, travel = Math.hypot(distance(original, moved), (original.y ?? 0) - (moved.y ?? 0));
        if (travel > maxMove) continue;
        const adjusted = { ...record, position: moved, rotation: record.kind === "sign" ? anchor.expectedHeading : record.rotation }, next = placementIssues(context, adjusted, request, planned, ignored);
        if (!next.some((i) => i.severity !== "info")) {
          record = adjusted;
          checks = next;
          reasons = ["Adjusted roadside/station/support height/facing within maxAutoMove"];
          break;
        }
      }
    }
    const invalid2 = checks.some((i) => i.severity !== "info"), state = invalid2 ? "INVALID" : reasons.length ? "ADJUSTED" : "VALID";
    const signBase = context.map.signs?.find((s) => s.id === record.id)?.postBaseY;
    const finalCommands = commands.map((c) => c.op === "placeObject" ? { ...c, properties: { ...c.properties, position: record.position, rotation: record.rotation } } : c.op === "modifyObject" ? { ...c, properties: { ...c.properties, position: record.position, rotation: record.rotation } } : c.op === "createSign" || c.op === "modifySign" ? { ...c, properties: { ...c.properties, position: record.position, heading: record.rotation, ...signBase === void 0 ? {} : { postBaseY: Math.min(signBase, record.position.y ?? 0) } } } : c.op === "setSignalPlacement" ? { ...c, position: record.position, heading: record.rotation } : c);
    candidates.push({ id: record.id, state, position: record.position, rotation: record.rotation, anchor: deriveAnchor(context, record, request.roadId), issues: checks, adjustmentReasons: reasons, commands: finalCommands, sourceId, heightMode: request.heightMode ?? (request.type === "tree" ? "GROUND" : "ROAD_SURFACE"), autoMove: Math.hypot(distance(original, record.position), (original.y ?? 0) - (record.position.y ?? 0)) });
    if (!invalid2) {
      operations.push(...finalCommands);
      planned.push(record);
    }
  };
  if (request.mode === "REPAIR" || request.mode === "REPLACE") {
    if (!request.roadId && !request.bbox && !request.intersectionId && !request.objectIds?.length) throw new Error("REPAIR/REPLACE require explicit local scope or objectIds");
    const rows = queryObjects(context, { roadId: request.roadId, intersectionId: request.intersectionId, bbox: request.bbox, type: request.type, full: !request.roadId && !request.intersectionId && !request.bbox, limit: 5e3 }).objects.filter((o) => !request.objectIds || request.objectIds.includes(o.id));
    if (request.mode === "REPLACE" && request.roadId && request.type !== "trafficLight" && request.type !== "roadSign" && request.spacing) {
      const path = context.path(request.roadId), start = request.stationStart ?? 0, end = request.stationEnd ?? polylineLength(path), spacing = request.spacing;
      if (spacing <= 0 || start < 0 || end < start || end > polylineLength(path)) throw new Error("Invalid REPLACE station range/spacing");
      const selected = rows.filter((o) => {
        const a = deriveAnchor(context, o, request.roadId);
        return a && a.station >= start && a.station <= end;
      });
      for (const o of selected) ignored.add(o.id);
      const available = selected.map((o) => ({ object: o, anchor: deriveAnchor(context, o, request.roadId) })).sort((a, b) => a.anchor.station - b.anchor.station), assigned = /* @__PURE__ */ new Set();
      const sides = request.side === "both" ? [-1, 1] : request.side ? [request.side === "left" ? -1 : 1] : [...new Set(available.map((o) => o.anchor.lateralOffset < 0 ? -1 : 1))];
      for (let station = start; station <= end + 1e-6; station += spacing) for (const side of sides) {
        const actual = station + (side === 1 && request.arrangement === "STAGGERED" ? spacing / 2 : 0) + (request.longitudinalOffset ?? 0);
        if (actual > end || actual < start) continue;
        if (candidates.length >= limit) throw new Error("Replacement brush exceeds candidate limit");
        const old = available.filter((o) => !assigned.has(o.object.id) && (o.anchor.lateralOffset < 0 ? -1 : 1) === side).sort((a, b) => Math.abs(a.anchor.station - actual) - Math.abs(b.anchor.station - actual))[0]?.object;
        const template = old ?? available[0]?.object;
        if (!template) continue;
        if (old) assigned.add(old.id);
        const authored = context.map.objects.find((o) => o.id === template.id);
        const placement = brushPosition(context, request, actual, side, random), id = old?.id ?? nextId(), object = { ...structuredClone(authored), id, position: placement.position, rotation: placement.rotation };
        handle(prefabRecord(object), old ? [{ op: "modifyObject", id, properties: { position: object.position, rotation: object.rotation } }] : [{ op: "placeObject", properties: object }], old?.id);
      }
      if (candidates.some((c) => c.state !== "INVALID")) {
        for (const o of selected) if (!assigned.has(o.id)) operations.push({ op: "removeObject", id: o.id });
      }
    } else for (const old of rows) {
      const anchor = deriveAnchor(context, old, request.roadId);
      if (!anchor) continue;
      if (anchor.station < (request.stationStart ?? 0) || anchor.station > (request.stationEnd ?? Infinity)) continue;
      if (request.mode === "REPAIR" && !placementIssues(context, old, request).some((i) => i.severity !== "info")) continue;
      const station = request.mode === "REPLACE" && request.spacing ? Math.round(anchor.station / request.spacing) * request.spacing : anchor.station;
      const commands = reanchorCommands(context, old.id, { roadId: request.roadId, station, verticalOffset: request.heightOffset, strategy: request.mode === "REPAIR" ? "reanchorRoadside" : void 0 }), command = commands[0];
      if (command.op === "modifyObject") {
        const roadId = request.roadId ?? anchor.anchorRoadId, side = anchor.lateralOffset < 0 ? -1 : 1;
        const placement = brushPosition(context, { ...request, roadId, randomPositionJitter: 0, randomRotationJitter: 0 }, station, side);
        if (request.heightMode || request.type === "tree") command.properties.position = { ...command.properties.position, y: placement.position.y };
        if (request.orientation) command.properties.rotation = placement.rotation;
        if (request.lateralOffset !== void 0) command.properties.position = { ...placement.position };
      }
      const position = command.op === "modifyObject" || command.op === "modifySign" ? command.properties.position ?? old.position : command.op === "setSignalPlacement" ? command.position : old.position;
      const rotation = command.op === "modifyObject" ? command.properties.rotation ?? old.rotation : command.op === "modifySign" ? command.properties.heading ?? old.rotation : command.op === "setSignalPlacement" ? command.heading : old.rotation;
      handle({ ...old, position, rotation }, commands, old.id, request.mode === "REPAIR" ? old.position : void 0);
      if (candidates.length > limit) throw new Error("Brush limit reached; narrow scope");
    }
  } else if (request.type === "trafficLight") {
    const j = context.map.intersections.find((j2) => j2.id === request.intersectionId);
    if (!j) throw new Error("Unknown brush intersection");
    for (const c of j.connections) if (!request.approaches || request.approaches.includes(c.port)) {
      const signal = signalApproach(context.map, j, c.port);
      if (!signal.incoming) continue;
      const current = editableObjects(context).find((o) => o.id === `signal:${j.id}:${c.port}`);
      const position = request.signalSide === "near-side" ? { x: signal.mouth.x + signal.outward.x * 6 + signal.right.x * (signal.roadWidth / 2 + 2), y: j.position.y ?? 0, z: signal.mouth.z + signal.outward.z * 6 + signal.right.z * (signal.roadWidth / 2 + 2) } : signal.expectedPosition;
      const record = { id: `signal:${j.id}:${c.port}`, kind: "trafficLight", type: "trafficLight", position: { ...position, y: (position.y ?? 0) + (request.heightOffset ?? 0) }, rotation: signal.expectedHeading, roadId: c.roadId, intersectionId: j.id, approach: c.port, derived: false, size: { width: 0.3, depth: 0.3, height: request.poleHeight ?? signal.height, approximate: true } };
      handle(record, [{ op: "setSignalPlacement", intersectionId: j.id, approach: c.port, position: record.position, heading: record.rotation, poleHeight: request.poleHeight }], current?.id);
    }
  } else {
    const spots = [];
    if (request.mode === "AREA") {
      if (request.type !== "tree" && request.type !== "green_strip") throw new Error("AREA is reserved for vegetation");
      const area = request.bbox ?? (request.polygon ? bounds(request.polygon) : void 0);
      if (!area) throw new Error("AREA requires bbox or polygon");
      const density = request.density ?? 2e-3;
      if (!Number.isFinite(density) || density <= 0) throw new Error("AREA density must be positive objects/m\xB2");
      const count = Math.ceil((area.maxX - area.minX) * (area.maxZ - area.minZ) * density);
      if (count > limit) throw new Error("Area brush exceeds limit; reduce density or area");
      for (let i = 0; i < count; i++) {
        const point = { x: area.minX + random() * (area.maxX - area.minX), z: area.minZ + random() * (area.maxZ - area.minZ) };
        if (!request.polygon || insidePolygon(point, request.polygon)) spots.push({ point, side: 1 });
      }
    } else {
      if (!request.roadId) throw new Error("Road brush requires roadId");
      const length = polylineLength(context.path(request.roadId)), start = request.stationStart ?? 0, end = request.mode === "SINGLE" ? start : request.stationEnd ?? length, spacing = request.spacing ?? 30;
      if (![start, end, spacing].every(Number.isFinite) || spacing <= 0 || start < 0 || end > length || end < start) throw new Error("Invalid brush station interval/spacing");
      const sides = request.side === "both" ? [-1, 1] : [request.side === "left" ? -1 : 1];
      for (let station = start; station <= end + 1e-6; station += spacing) for (const side of sides) {
        const phase = side === 1 && request.arrangement === "STAGGERED" ? spacing / 2 : 0, s = station + phase + (request.longitudinalOffset ?? 0);
        if (s <= end && s >= 0) spots.push({ station: s, side });
        if (spots.length > limit) throw new Error("Brush exceeds candidate limit");
      }
    }
    for (const spot of spots) {
      const id = nextId(), placement = spot.station !== void 0 ? brushPosition(context, request, spot.station, spot.side, random) : { position: { ...spot.point, y: ((request.heightMode === "ABSOLUTE" ? request.height : context.map.regional ? regionalTerrainSampler(context.map).heightAt(spot.point.x, spot.point.z) : 0) ?? 0) + (request.heightOffset ?? 0) }, rotation: (request.yaw ?? 0) + (random() - 0.5) * 2 * (request.randomRotationJitter ?? Math.PI), heightMode: "GROUND" };
      const factor = 1 + (random() - 0.5) * 2 * (request.randomScaleJitter ?? 0), s = typeof request.scale === "number" ? { x: request.scale, y: request.scale, z: request.scale } : request.scale ?? { x: 1, y: 1, z: 1 }, scale = { x: s.x * factor, y: s.y * factor, z: s.z * factor };
      if (Math.min(scale.x, scale.y, scale.z) <= 0) throw new Error("Brush scale must remain positive");
      if (request.type === "roadSign") {
        if (!request.nameId || !context.map.roadNames?.[request.nameId]) throw new Error("Road-sign placement requires an existing registry nameId");
        const record = { id, kind: "sign", type: "roadSign", position: placement.position, rotation: placement.rotation, roadId: request.roadId, derived: false, size: { width: 0.5, depth: 0.5, height: 5.5, approximate: true } };
        handle(record, [{ op: "createSign", id, roadId: request.roadId, station: spot.station, direction: request.direction, properties: { position: record.position, heading: record.rotation, destinations: [{ roadNameId: request.nameId, arrow: "straight" }] } }]);
      } else {
        const object = { id, prefabId: request.type, position: placement.position, rotation: placement.rotation, scale };
        handle(prefabRecord(object), [{ op: "placeObject", properties: object }]);
      }
    }
  }
  const invalid = candidates.filter((c) => c.state === "INVALID").length;
  return { request, candidates, operations, stats: { planned: candidates.length, valid: candidates.filter((c) => c.state === "VALID").length, adjusted: candidates.filter((c) => c.state === "ADJUSTED").length, invalid, skipped: invalid, added: candidates.filter((c) => c.state !== "INVALID" && !c.sourceId).length, moved: candidates.filter((c) => c.state !== "INVALID" && c.sourceId).length, removed: operations.filter((op) => op.op === "removeObject").length }, valid: policy !== "STRICT" || invalid === 0 };
}

// src/editor/StructureAnalysis.ts
function inspectStructure(context, id) {
  const road = context.road(id), path = context.path(id), kind = structureType(road), enclosure = road.structure?.enclosure, terrain = context.map.regional ? regionalTerrainSampler(context.map) : void 0;
  const deck = path.map((p) => ({ xyz: p, deckElevation: p.y ?? 0, groundElevation: terrain?.heightAt(p.x, p.z) ?? 0 }));
  return {
    roadId: id,
    type: kind,
    approximate: true,
    deckThickness: context.limits.deckThickness,
    deck,
    span: { start: 0, end: polylineLength(path) },
    enclosure: enclosure ?? null,
    clearance: enclosure?.clearance ?? null,
    portals: enclosure && enclosure.kind !== "cutting" ? [{ end: "start", position: path[0], derived: true }, { end: "end", position: path.at(-1), derived: true }] : [],
    ceilingCoverage: enclosure && enclosure.kind !== "cutting" ? { derived: true, source: "RoadBuilder enclosure strip", completeByConstruction: true, meshContinuityVerified: false } : null,
    nearbyUpperLowerRoads: [...context.crossings(id), ...context.overUnderRoads(id)],
    nearbyObjects: queryObjects(context, { roadId: id, radius: Math.max(-roadEdges(road).left, roadEdges(road).right) + 20, limit: 100 }).objects,
    reviewRequired: kind === "depressed" && !enclosure,
    reviewReason: kind === "depressed" && !enclosure ? "Negative road elevation has no authored enclosure; cover/portal intent needs review" : null,
    envelope: context.envelope(id)
  };
}
function structureIssues(context, id) {
  const road = context.road(id), kind = structureType(road), enclosure = road.structure?.enclosure, result = [];
  if (kind === "depressed" && !enclosure) result.push(issue("structure.missingPortal", { roadId: id }, "Depressed road has no authored enclosure/portal intent", {}, { reviewRequired: true, approximate: true }));
  if (enclosure && enclosure.kind !== "cutting" && enclosure.clearance < context.limits.clearance) result.push(issue("structure.insufficientVerticalEnvelope", { roadId: id }, "Enclosed floor-to-ceiling clearance is below review threshold", { actual: enclosure.clearance, required: context.limits.clearance }));
  if (enclosure && enclosure.kind !== "cutting") result.push(issue("structure.shellReviewRequired", { roadId: id }, "Ceiling is runtime derived; shell continuity and portal finish require visual review", { clearance: enclosure.clearance }, { severity: "info", reviewRequired: true, approximate: true }));
  for (const crossing of context.crossings(id)) if (!crossing.connected && crossing.clearance < context.limits.clearance && Math.abs((crossing.point.y ?? 0) - crossing.otherY) > 0.5) result.push(issue("structure.insufficientVerticalEnvelope", { roadId: id, station: crossing.station }, "Crossing deck clearance is below threshold", { otherRoadId: crossing.roadId, actual: crossing.clearance, required: crossing.requiredClearance }));
  return result;
}

// src/editor/MapReview.ts
function diagnoseEngineering(context, scope, domain = "all") {
  const roads = domain === "objects" ? [] : context.selectedRoads(scope), issues = [];
  for (const road of roads) {
    if (domain === "all" || domain === "profile") issues.push(...profileIssues(context, road.id));
    if ((domain === "all" || domain === "ramps") && roadFunction(road) === "ramp") issues.push(...rampIssues(context, road.id));
    if (domain === "all" || domain === "structures") issues.push(...structureIssues(context, road.id));
  }
  let objectsChecked = 0;
  if (domain === "all" || domain === "objects") {
    let offset2 = 0;
    do {
      const page = queryObjects(context, { ...scope, limit: 1e3, offset: offset2 });
      for (const o of page.objects) {
        issues.push(...placementIssues(context, o));
        objectsChecked++;
      }
      if (page.pagination.nextOffset === null) break;
      offset2 = page.pagination.nextOffset;
    } while (true);
    for (const j of context.map.intersections) if (j.signalized && (scope.full || scope.intersectionId === j.id || roads.some((r) => j.connections.some((c) => c.roadId === r.id)))) {
      for (const c of j.connections) if (!editableObjects(context).some((o) => o.id === `signal:${j.id}:${c.port}`)) {
        const r = context.road(c.roadId);
        if (r.travelDirection === "two-way" || r.travelDirection === "forward" === (c.end === "end")) issues.push(issue("trafficLight.unanchored", { intersectionId: j.id, roadId: r.id }, "Generated approach has no legal signal pole", { approach: c.port }, { reviewRequired: true }));
      }
    }
  }
  const rank = { info: 0, warning: 1, error: 2 };
  const filtered = issues.filter((i) => (!scope.codes?.length || scope.codes.some((c) => i.code.startsWith(c))) && rank[i.severity] >= rank[scope.minSeverity ?? "info"]);
  const limit = scope.limit ?? 200, offset = scope.offset ?? 0;
  return { schemaVersion: 1, domain, scope, coverage: { roads: roads.length, objects: objectsChecked }, counts: { total: filtered.length, error: filtered.filter((i) => i.severity === "error").length, warning: filtered.filter((i) => i.severity === "warning").length, info: filtered.filter((i) => i.severity === "info").length }, issues: filtered.slice(offset, offset + limit), pagination: { offset, limit, total: filtered.length, nextOffset: offset + limit < filtered.length ? offset + limit : null } };
}
function diagnosticDelta(before, after) {
  const key = (i) => [i.id ?? [i.code, i.roadId ?? "", i.intersectionId ?? "", i.objectId ?? "", i.station?.toFixed(2) ?? ""].join(":"), i.severity].join(":");
  const a = new Map(before.issues.map((i) => [key(i), i])), b = new Map(after.issues.map((i) => [key(i), i]));
  return { resolved: [...a].filter(([k2]) => !b.has(k2)).map(([, v]) => v), new: [...b].filter(([k2]) => !a.has(k2)).map(([, v]) => v), unchanged: [...b].filter(([k2]) => a.has(k2)).map(([, v]) => v) };
}
function collectionDiff(before, after) {
  const a = new Map(before.map((v) => [v.id, v])), b = new Map(after.map((v) => [v.id, v]));
  return { added: after.filter((v) => !a.has(v.id)), removed: before.filter((v) => !b.has(v.id)), modified: after.filter((v) => a.has(v.id) && JSON.stringify(a.get(v.id)) !== JSON.stringify(v)).map((v) => ({ before: a.get(v.id), after: v })) };
}
function topology(context, ids) {
  const graph = new Map([...ids].map((id) => [id, /* @__PURE__ */ new Set()]));
  const join3 = (a, b) => {
    if (ids.has(a) && ids.has(b)) {
      graph.get(a).add(b);
      graph.get(b).add(a);
    }
  };
  for (const l of context.map.roadLinks ?? []) join3(l.from.roadId, l.to.roadId);
  for (const j of context.map.intersections) for (const a of j.connections) for (const b of j.connections) if (a.roadId !== b.roadId) join3(a.roadId, b.roadId);
  const seen = /* @__PURE__ */ new Set();
  let components = 0;
  for (const id of ids) if (!seen.has(id)) {
    components++;
    const queue = [id];
    while (queue.length) {
      const next = queue.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...graph.get(next) ?? []);
    }
  }
  return { components, deadEnds: [...graph].filter(([, v]) => v.size <= 1).map(([id]) => id), adjacency: [...graph].map(([id, links]) => ({ id, links: [...links] })) };
}
function laneTopology(context, ids) {
  if (!ids.size) return { connections: [], reachable: (_from, _to) => false };
  const network = buildCityRoadNetwork({ ...context.map, roads: context.map.roads.filter((r) => ids.has(r.id)), intersections: context.map.intersections.filter((j) => j.connections.every((c) => ids.has(c.roadId))), roadLinks: (context.map.roadLinks ?? []).filter((l) => ids.has(l.from.roadId) && ids.has(l.to.roadId)) });
  const adjacency = /* @__PURE__ */ new Map();
  for (const road of network.segments) for (const lane of road.lanes) adjacency.set(lane.id, new Set(road.lanes.filter((other) => other.direction === lane.direction).map((other) => other.id)));
  for (const c of network.laneConnections) adjacency.get(c.fromLaneId)?.add(c.toLaneId);
  return { connections: network.laneConnections.map((c) => [c.intersectionId, c.fromLaneId, c.toLaneId].join("|")), reachable: (from, to) => {
    const queue = network.segments.find((r) => r.id === from)?.lanes.map((l) => l.id) ?? [], targets = new Set(network.segments.find((r) => r.id === to)?.lanes.map((l) => l.id) ?? []), seen = /* @__PURE__ */ new Set();
    while (queue.length) {
      const id = queue.pop();
      if (targets.has(id)) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...adjacency.get(id) ?? []);
    }
    return false;
  } };
}
function semanticDiff(before, after, options = {}) {
  const a = analysisContext(before), b = analysisContext(after), roads = collectionDiff(before.roads, after.roads), junctions = collectionDiff(before.intersections, after.intersections), objects = collectionDiff(editableObjects(a), editableObjects(b));
  const geometry = roads.modified.map(({ before: r, after: s }) => {
    const p = a.path(r.id), q = b.path(s.id), l = polylineLength(p), m = polylineLength(q);
    const maxDisplacement = Math.max(...p.map((v) => project(q, v).distance), ...q.map((v) => project(p, v).distance));
    let elevationDelta = 0;
    for (let i = 0; i <= 100; i++) elevationDelta = Math.max(elevationDelta, Math.abs((sampleAt(p, l * i / 100).point.y ?? 0) - (sampleAt(q, m * i / 100).point.y ?? 0)));
    const endpointsChanged = JSON.stringify([p[0], p.at(-1)]) !== JSON.stringify([q[0], q.at(-1)]), controlPointsChanged = Math.max(r.centerline.length, s.centerline.length) - r.centerline.filter((v, i) => JSON.stringify(v) === JSON.stringify(s.centerline[i])).length;
    const endpointChanges = { start: { before: p[0], after: q[0] }, end: { before: p.at(-1), after: q.at(-1) } };
    return { id: r.id, approximate: true, metricMethod: "symmetric path projection; 100 normalized elevation samples", horizontalGeometryChanged: maxDisplacement > 1e-6, elevationOnly: maxDisplacement <= 1e-6 && elevationDelta > 1e-6, maxDisplacement, elevationDelta, controlPointsChanged, endpointsChanged, endpointChanges, beforeMaxHeadingDelta: inspectHorizontal(a, r.id).maxHeadingDelta, afterMaxHeadingDelta: inspectHorizontal(b, r.id).maxHeadingDelta, crossingElevationsPreserved: a.crossings(r.id).every((c) => Math.abs((project(q, c.point).point.y ?? 0) - (c.point.y ?? 0)) < 1e-6) };
  });
  const links = collectionDiff(before.roadLinks ?? [], after.roadLinks ?? []), ids = new Set([...roads.added, ...roads.removed, ...roads.modified.map((r) => r.after)].map((r) => r.id));
  for (const l of [...links.added, ...links.removed, ...links.modified.flatMap((l2) => [l2.before, l2.after])]) {
    ids.add(l.from.roadId);
    ids.add(l.to.roadId);
  }
  for (const j of [...junctions.added, ...junctions.removed, ...junctions.modified.flatMap((j2) => [j2.before, j2.after])]) for (const c of j.connections) ids.add(c.roadId);
  const topologyChanged = !!(links.added.length || links.removed.length || links.modified.length || junctions.added.length || junctions.removed.length || junctions.modified.some((j) => JSON.stringify(j.before.connections) !== JSON.stringify(j.after.connections)) || roads.added.length || roads.removed.length);
  for (const route of options.routes ?? []) {
    ids.add(route.from);
    ids.add(route.to);
  }
  const seeds = new Set(ids);
  const expand = (context) => {
    for (const l of context.map.roadLinks ?? []) if (seeds.has(l.from.roadId) || seeds.has(l.to.roadId)) {
      ids.add(l.from.roadId);
      ids.add(l.to.roadId);
    }
    for (const j of context.map.intersections) if (j.connections.some((c) => seeds.has(c.roadId))) for (const c of j.connections) ids.add(c.roadId);
  };
  if (options.full) {
    for (const r of [...before.roads, ...after.roads]) ids.add(r.id);
  } else {
    expand(a);
    expand(b);
  }
  const oldGraph = topology(a, new Set([...ids].filter((id) => a.roads.has(id)))), newGraph = topology(b, new Set([...ids].filter((id) => b.roads.has(id))));
  const oldLanes = laneTopology(a, new Set([...ids].filter((id) => a.roads.has(id)))), newLanes = laneTopology(b, new Set([...ids].filter((id) => b.roads.has(id))));
  const routeChecks = (options.routes ?? []).map((route) => ({ ...route, before: oldLanes.reachable(route.from, route.to), after: newLanes.reachable(route.from, route.to), method: "logical lane reachability; same-direction lane changes allowed", scope: options.full ? "full" : "localDependency", reviewRequired: !options.full }));
  const affected = [...roads.added, ...roads.removed, ...roads.modified.flatMap((r) => [r.before, r.after])].map((r) => bounds((a.roads.get(r.id) === r ? a : b).path(r.id), r.laneCount * r.laneWidth / 2 + Math.max(r.shoulders?.left ?? 0, r.shoulders?.right ?? 0) + (r.sidewalk?.enabled ? r.sidewalk.width : 0)));
  for (const o of [...objects.added, ...objects.removed, ...objects.modified.flatMap((o2) => [o2.before, o2.after])]) affected.push(bounds([o.position], Math.max(o.size.width, o.size.depth) / 2));
  for (const j of [...junctions.added, ...junctions.removed, ...junctions.modified.flatMap((j2) => [j2.before, j2.after])]) affected.push(bounds([j.position], 40));
  return { schemaVersion: 1, signs: collectionDiff(before.signs ?? [], after.signs ?? []), roads: { added: roads.added.map((r) => r.id), removed: roads.removed.map((r) => r.id), modified: geometry }, intersections: { added: junctions.added.map((j) => j.id), removed: junctions.removed.map((j) => j.id), modified: junctions.modified.map((j) => ({ id: j.after.id, armsBefore: j.before.connections, armsAfter: j.after.connections, markingsRegenerated: JSON.stringify([j.before.markingFootprint, j.before.approaches]) !== JSON.stringify([j.after.markingFootprint, j.after.approaches]) })) }, objects: { added: objects.added.map((o) => o.id), removed: objects.removed.map((o) => o.id), modified: objects.modified.map((o) => ({ id: o.after.id, type: o.after.type, displacement: Math.hypot(distance(o.before.position, o.after.position), (o.before.position.y ?? 0) - (o.after.position.y ?? 0)), heightDelta: (o.after.position.y ?? 0) - (o.before.position.y ?? 0), rotationDelta: angleDelta(o.after.rotation, o.before.rotation), anchorBefore: deriveAnchor(a, o.before), anchorAfter: deriveAnchor(b, o.after), anchorRoadUnchanged: deriveAnchor(a, o.before)?.anchorRoadId === deriveAnchor(b, o.after)?.anchorRoadId, anchorApproachUnchanged: o.before.approach === o.after.approach })) }, structures: roads.modified.filter((r) => JSON.stringify(r.before.structure) !== JSON.stringify(r.after.structure) || structureType(r.before) !== structureType(r.after) || (structureType(r.before) !== "at_grade" || structureType(r.after) !== "at_grade") && geometry.some((g) => g.id === r.after.id && (g.elevationDelta > 1e-6 || g.maxDisplacement > 1e-6))).map((r) => ({ roadId: r.after.id, before: r.before.structure ?? null, after: r.after.structure ?? null, beforeType: structureType(r.before), afterType: structureType(r.after) })), roadLinks: links, affectedBbox: union(affected), maxRoadDisplacement: Math.max(0, ...geometry.map((r) => r.maxDisplacement)), maxElevationDelta: Math.max(0, ...geometry.map((r) => r.elevationDelta)), topology: { changed: topologyChanged, scope: options.full ? "full" : "localDependency", componentDelta: newGraph.components - oldGraph.components, newDeadEnds: newGraph.deadEnds.filter((id) => !oldGraph.deadEnds.includes(id)), before: oldGraph, after: newGraph, routeChecks, laneConnectionsAdded: newLanes.connections.filter((c) => !oldLanes.connections.includes(c)), laneConnectionsRemoved: oldLanes.connections.filter((c) => !newLanes.connections.includes(c)), directedLaneRouteVerified: true } };
}
function reviewMaps(before, after, options = {}) {
  const diff = semanticDiff(before, after, options), scope = options.full ? { full: true, limit: 1e6 } : diff.affectedBbox ? { bbox: diff.affectedBbox, limit: 1e6 } : { bbox: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, limit: 1e6 };
  const baseline = diagnoseEngineering(analysisContext(before), scope), afterReport = diagnoseEngineering(analysisContext(after), scope);
  const legacyScope = { ...scope, limit: 1e6 };
  const legacyBefore = diagnoseMap(before, legacyScope, { retainAllIssues: true }), legacyAfter = diagnoseMap(after, legacyScope, { retainAllIssues: true });
  const diagnosticsBefore = { ...baseline, issues: [...baseline.issues, ...legacyBefore.issues] }, diagnosticsAfter = { ...afterReport, issues: [...afterReport.issues, ...legacyAfter.issues] };
  return { diff, diagnosticsBefore, diagnosticsAfter, issueDiff: diagnosticDelta(diagnosticsBefore, diagnosticsAfter) };
}

// src/editor/CityEditingKernel.ts
var editing = (map) => map.editing ?? { corridors: [], groups: [], attachments: [], ramps: [] };
var endpoint = (map, e) => {
  const r = map.roads.find((r2) => r2.id === e.roadId);
  if (!r) throw new Error(`Missing road ${e.roadId}`);
  return roadPoints({ ...r, curve: "polyline" })[e.end === "start" ? 0 : r.centerline.length - 1];
};
var sameEnd = (a, b) => a.roadId === b.roadId && a.end === b.end;
var areaOf = (e) => "centerline" in e ? bounds(roadPoints(e), e.laneCount * e.laneWidth / 2 + 10) : bounds([e.position], 40);
var EditTransaction = class {
  constructor(before, index) {
    this.before = before;
    this.index = index;
    this.map = {
      ...before,
      bounds: { ...before.bounds },
      roads: [...before.roads],
      intersections: [...before.intersections],
      objects: [...before.objects],
      signs: [...before.signs ?? []],
      roadLinks: structuredClone(before.roadLinks ?? []),
      connectionPorts: structuredClone(before.connectionPorts ?? []),
      editing: structuredClone(editing(before))
    };
    this.used = new Set([...before.roads, ...before.intersections, ...before.objects, ...before.signs ?? [], ...before.roadLinks ?? [], ...before.connectionPorts ?? [], ...editing(before).corridors, ...editing(before).groups, ...editing(before).ramps, ...editing(before).attachments].map((e) => e.id));
  }
  before;
  index;
  map;
  changed = /* @__PURE__ */ new Set();
  notes = [];
  metrics = {};
  used;
  id(base, explicit = false) {
    let id = base, n = 2;
    if (explicit && this.used.has(id)) throw new Error(`ID already exists: ${id}`);
    while (this.used.has(id)) id = `${base}-${n++}`;
    this.used.add(id);
    return id;
  }
  record(id, value) {
    const previous = this.metrics[id];
    this.metrics[id] = previous && typeof previous === "object" && !Array.isArray(previous) ? { ...previous, ...value } : value;
  }
  /** Name references are semantic, independent of the road carrying the sign. */
  remapSignNames(oldIds, nameId) {
    if (!oldIds.size) return;
    this.map.signs = this.map.signs.map((sign) => {
      let changed = false;
      const destinations = sign.destinations.map((destination) => {
        const roadNameId = oldIds.has(destination.roadNameId) ? nameId : destination.roadNameId;
        const directionId = destination.directionId && oldIds.has(destination.directionId) ? nameId : destination.directionId;
        if (roadNameId === destination.roadNameId && directionId === destination.directionId) return destination;
        changed = true;
        return { ...destination, roadNameId, ...destination.directionId ? { directionId } : {} };
      });
      const next = { ...sign, destinations };
      if (sign.approachRoadNameId && oldIds.has(sign.approachRoadNameId)) {
        next.approachRoadNameId = nameId;
        changed = true;
      }
      if (sign.interchangeId && oldIds.has(sign.interchangeId)) {
        next.interchangeId = nameId;
        changed = true;
      }
      if (changed) this.changed.add(sign.id);
      return changed ? next : sign;
    });
  }
  assertUnlocked(id) {
    const group = editing(this.map).groups.find((g) => g.locked && (g.id === id || g.memberIds.includes(id)));
    if (group) throw new Error(`Locked group ${group.name}: unlock before editing ${id}`);
  }
  road(id) {
    this.assertUnlocked(id);
    const i = this.map.roads.findIndex((r) => r.id === id);
    if (i < 0) throw new Error(`Missing road ${id}`);
    if (!this.changed.has(id)) {
      this.map.roads[i] = structuredClone(this.map.roads[i]);
      this.changed.add(id);
    }
    return this.map.roads[i];
  }
  junction(id) {
    this.assertUnlocked(id);
    const i = this.map.intersections.findIndex((j) => j.id === id);
    if (i < 0) throw new Error(`Missing intersection ${id}`);
    if (!this.changed.has(id)) {
      this.map.intersections[i] = structuredClone(this.map.intersections[i]);
      this.changed.add(id);
    }
    return this.map.intersections[i];
  }
  roadsFor(id) {
    const corridor = editing(this.map).corridors.find((c) => c.id === id);
    const group = editing(this.map).groups.find((g) => g.id === id);
    return (corridor ? corridor.roadIds : group ? group.memberIds.filter((id2) => this.map.roads.some((r) => r.id === id2)) : [id]).map((id2) => this.road(id2));
  }
  nearby(area) {
    const ids = /* @__PURE__ */ new Set([...this.index.query(area), ...this.changed]);
    return this.map.roads.filter((r) => ids.has(r.id) && overlaps(areaOf(r), area));
  }
  detach(e) {
    for (const j of this.map.intersections) if (j.connections.some((c) => sameEnd(c, e))) this.junction(j.id).connections = j.connections.filter((c) => !sameEnd(c, e));
    this.map.roadLinks = this.map.roadLinks.filter((l) => !sameEnd(l.from, e) && !sameEnd(l.to, e));
  }
  link(from, to) {
    this.assertUnlocked(from.roadId);
    this.assertUnlocked(to.roadId);
    if (sameEnd(from, to)) throw new Error("Cannot connect an endpoint to itself");
    if (this.map.intersections.some((j) => j.connections.some((c) => sameEnd(c, from) || sameEnd(c, to)))) throw new Error("Intersection owns this endpoint");
    const a = endpoint(this.map, from), b = endpoint(this.map, to);
    if (Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z) > 0.2) throw new Error("Connection endpoints must coincide in XYZ");
    if (!this.map.roadLinks.some((l) => sameEnd(l.from, from) && sameEnd(l.to, to) || sameEnd(l.from, to) && sameEnd(l.to, from)))
      this.map.roadLinks.push({ id: this.id("link"), from: { ...from }, to: { ...to } });
  }
  remapEnd(id, to) {
    const remap = (e) => {
      if (e.roadId === id && e.end === "end") e.roadId = to;
    };
    for (const l of this.map.roadLinks) {
      remap(l.from);
      remap(l.to);
    }
    for (const j of this.map.intersections) if (j.connections.some((c) => c.roadId === id && c.end === "end")) for (const c of this.junction(j.id).connections) remap(c);
    for (const p of this.map.connectionPorts) remap(p.endpoint);
    for (const ramp of editing(this.map).ramps) {
      remap(ramp.from);
      remap(ramp.to);
    }
  }
  remapCollections(id, replacements) {
    if (this.map.regional) {
      if (this.map.regional === this.before.regional) this.map.regional = structuredClone(this.map.regional);
      const regional = this.map.regional, h = regional.highways;
      for (const collection of [regional.routes, regional.structures, regional.exits, h?.routes ?? [], h?.junctions ?? [], h?.exits ?? [], h?.services ?? []]) for (const item of collection) if (item.roadIds.includes(id)) {
        const next = [...new Set(item.roadIds.flatMap((old) => old === id ? replacements : [old]))];
        if (!next.length) throw new Error(`Cannot remove the last road referenced by regional record ${item.id}`);
        item.roadIds = next;
      }
    }
    if (this.map.environment.landmarks?.some((l) => l.roadIds.includes(id))) {
      this.map.environment = { ...this.map.environment, landmarks: this.map.environment.landmarks.map((l) => ({ ...l, roadIds: [...new Set(l.roadIds.flatMap((old) => old === id ? replacements : [old]))] })).filter((l) => l.roadIds.length) };
    }
  }
  split(id, point) {
    const road = this.road(id), points = roadPoints(road), q = project(points, point), length = polylineLength(points);
    if (q.distance > 0.25 || Math.abs((q.point.y ?? 0) - (point.y ?? q.point.y ?? 0)) > 0.25) throw new Error("Split point must lie on the road in XYZ");
    if (q.along < 0.1) return { from: { roadId: id, end: "start" }, to: { roadId: id, end: "start" } };
    if (q.along > length - 0.1) return { from: { roadId: id, end: "end" }, to: { roadId: id, end: "end" } };
    const after = { ...structuredClone(road), id: this.id(`${id}-section`), centerline: slicePath(points, q.along, length), curve: "polyline", elevationMode: "custom" };
    road.centerline = slicePath(points, 0, q.along);
    road.curve = "polyline";
    road.elevationMode = "custom";
    this.remapEnd(id, after.id);
    this.map.roads.push(after);
    this.changed.add(after.id);
    this.remapCollections(id, [id, after.id]);
    if (editing(this.map).curves?.[id]) delete editing(this.map).curves[id];
    this.map.signs = this.map.signs.map((sign) => {
      if (sign.roadId !== id) return sign;
      const station = sign.stationMetres ?? project(points, sign.position).along;
      const next = { ...structuredClone(sign), stationMetres: station > q.along ? station - q.along : station, roadId: station > q.along ? after.id : id };
      if (next.incomingRoadId === id) next.incomingRoadId = next.roadId;
      this.changed.add(sign.id);
      return next;
    });
    for (const c of editing(this.map).corridors) if (c.roadIds.includes(id)) c.roadIds.splice(c.roadIds.indexOf(id) + 1, 0, after.id);
    for (const g of editing(this.map).groups) if (g.memberIds.includes(id)) g.memberIds.push(after.id);
    const from = { roadId: id, end: "end" }, to = { roadId: after.id, end: "start" };
    this.link(from, to);
    return { from, to };
  }
  addRoad(command) {
    const id = this.id(command.id ?? "road", !!command.id);
    const fragment = newCityMap();
    const r = createRoad(fragment, {
      ...structuredClone(EDITOR_ROAD_PRESETS[command.preset ?? "local"].properties),
      ...structuredClone(command.properties),
      id,
      type: void 0,
      centerline: command.points,
      curve: command.properties?.curve ?? (command.points.length > 2 ? "smooth" : "polyline")
    });
    this.map.roads.push(r);
    this.changed.add(id);
    if (command.corridorId) {
      const c = editing(this.map).corridors.find((c2) => c2.id === command.corridorId);
      if (!c) throw new Error(`Missing corridor ${command.corridorId}`);
      c.roadIds.push(id);
    }
    return r;
  }
  intersection(position, roadIds, signalized = true, explicitId) {
    let j = this.map.intersections.find((j2) => distance(j2.position, position) < 8 && Math.abs((j2.position.y ?? 0) - (position.y ?? 0)) < 0.5);
    if (j) j = this.junction(j.id);
    else {
      j = {
        id: this.id(explicitId ?? "intersection", !!explicitId),
        type: "irregular",
        position: { ...position },
        rotation: 0,
        connections: [],
        signalized,
        signals: { profile: "lane-countdown", headHeight: 7.2 },
        portAngles: {},
        approachOffsets: {},
        markingFootprint: { kind: "junction", margin: 0.4 }
      };
      this.map.intersections.push(j);
      this.changed.add(j.id);
    }
    const arms = [];
    for (const id of [...new Set(roadIds)]) {
      const r = this.road(id), points = roadPoints(r), q = project(points, position), length = polylineLength(points);
      if (q.distance > Math.max(25, r.laneCount * r.laneWidth) || Math.abs((q.point.y ?? 0) - (position.y ?? 0)) > 0.5) throw new Error("Impossible intersection: approaches must share elevation and location");
      const cut = this.split(id, q.point);
      arms.push(cut.from);
      if (!sameEnd(cut.from, cut.to)) arms.push(cut.to);
      if (length < 4) throw new Error("Intersection approach is too short");
    }
    const count = j.connections.length + arms.filter((a) => !j.connections.some((c) => sameEnd(c, a))).length;
    if (count > 6) throw new Error("This foundation supports at most six junction arms");
    j.type = count <= 3 ? "t_4lane" : count === 4 ? "cross_4lane" : count === 5 ? "irregular" : "divided_cross";
    const allPorts = portsFor(j);
    const info = /* @__PURE__ */ new Map();
    for (const arm of arms) {
      if (j.connections.some((c) => sameEnd(c, arm))) continue;
      const r = this.road(arm.roadId), pts = roadPoints(r), len = polylineLength(pts), start = arm.end === "start", q = project(pts, position);
      const half = r.laneCount * r.laneWidth / 2 + Math.max(r.shoulders?.left ?? 0, r.shoulders?.right ?? 0);
      const mouth = sampleAt(pts, Math.max(0, Math.min(len, q.along))).point;
      const a = start ? pts[0] : pts.at(-1), b = start ? pts[1] ?? pts[0] : pts.at(-2) ?? pts.at(-1);
      const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
      info.set(arm, { pts, len, start, half, outward: { x: dx / dl, z: dz / dl }, mouth });
    }
    const extentFor = (arm) => {
      const own = info.get(arm);
      if (!own) return 12;
      let needed = 8;
      for (const [other, oi] of info) {
        if (other.roadId === arm.roadId && other.end === arm.end) continue;
        const cross = own.outward.x * oi.outward.z - own.outward.z * oi.outward.x;
        if (Math.abs(cross) < 0.2) continue;
        const px2 = oi.mouth.x - position.x, pz2 = oi.mouth.z - position.z;
        const along = Math.abs((px2 * oi.outward.z - pz2 * oi.outward.x) / cross);
        needed = Math.max(needed, along + oi.half / Math.abs(cross) + 3.2);
      }
      return Math.max(8, Math.min(80, needed));
    };
    for (const arm of arms) {
      if (j.connections.some((c) => sameEnd(c, arm))) continue;
      const r = this.road(arm.roadId), pts = info.get(arm).pts, len = info.get(arm).len, start = arm.end === "start", extent = extentFor(arm);
      const q = project(pts, position), cut = Math.min(len - 0.2, start ? q.along + extent : Math.max(0.2, q.along - extent));
      if (len < extent + 2) throw new Error("Intersection would leave a tiny approach; move crossing farther from the endpoint");
      const mouth = sampleAt(pts, cut).point, port = allPorts.find((p) => !j.connections.some((c) => c.port === p));
      this.detach(arm);
      r.centerline = slicePath(pts, start ? cut : 0, start ? len : cut);
      r.curve = "polyline";
      r.elevationMode = "custom";
      this.map.signs = this.map.signs.map((s) => s.roadId === r.id ? { ...s, stationMetres: Math.max(0, Math.min(polylineLength(r.centerline), (s.stationMetres ?? project(pts, s.position).along) - (start ? cut : 0))) } : s);
      j.portAngles[port] = Math.atan2(mouth.x - position.x, -(mouth.z - position.z)) + j.rotation;
      const localMouth = rotatePoint({ x: mouth.x - position.x, z: mouth.z - position.z }, -j.rotation);
      j.approachOffsets[port] = { x: localMouth.x, y: (mouth.y ?? 0) - (position.y ?? 0), z: localMouth.z };
      (j.pavementHeights ??= {})[port] = mouth.y ?? position.y ?? 0;
      j.connections.push({ ...arm, port });
    }
    return j;
  }
  autoConnect(roadId, mode2) {
    const r = this.road(roadId), pts = roadPoints(r), nearby = this.nearby(bounds(pts, 50)).filter((o) => o.id !== roadId);
    for (const end of ["start", "end"]) {
      const ep = endpoint(this.map, { roadId, end });
      let connected = false;
      for (const j of this.map.intersections.filter((j2) => overlaps(bounds([j2.position], 100), bounds([ep], 1)))) for (const port of portsFor(j)) {
        if (j.connections.some((c) => c.port === port)) continue;
        const cp = connectionPoint(j, port, this.map);
        if (distance(cp, ep) < 0.2 && Math.abs((cp.y ?? 0) - (ep.y ?? 0)) < 0.2) {
          this.junction(j.id).connections.push({ roadId, end, port });
          connected = true;
          break;
        }
      }
      if (connected) continue;
      for (const o of nearby) for (const otherEnd of ["start", "end"]) {
        const target = { roadId: o.id, end: otherEnd }, op = endpoint(this.map, target);
        if (distance(ep, op) < 0.2 && Math.abs((ep.y ?? 0) - (op.y ?? 0)) < 0.2 && !this.map.intersections.some((j) => j.connections.some((c) => sameEnd(c, target)))) this.link({ roadId, end }, target);
      }
    }
    const candidates = nearby.flatMap((o) => crossings(pts, roadPoints(o)).map((c) => ({ ...c, other: o })));
    if (mode2 === "overpass" || mode2 === "underpass") {
      if (candidates.length) {
        const stations3 = candidates.map((c) => project(pts, c.point).along), length = polylineLength(pts), h = mode2 === "overpass" ? Math.max(...candidates.map((c) => c.otherY)) + 8 : Math.min(...candidates.map((c) => c.otherY)) - 6;
        this.elevation(r, h, Math.max(0, Math.min(...stations3) - 15), Math.min(length, Math.max(...stations3) + 15), Math.max(120, Math.abs(h - (pts[0].y ?? 0)) * 12.5));
      }
      return;
    }
    if (mode2 === "none") return;
    const handled = [];
    for (const c of candidates) {
      if (Math.abs((c.point.y ?? 0) - c.otherY) > 0.5 || handled.some((p) => distance(p, c.point) < 8)) continue;
      if (["expressway", "ramp"].includes(roadFunction(r)) || ["expressway", "ramp"].includes(roadFunction(c.other))) {
        this.notes.push({ severity: "error", code: "expressway.crossing", ids: [roadId, c.other.id], message: "Choose overpass, underpass or an explicit ramp; controlled-access crossing cannot become an ordinary junction." });
        continue;
      }
      if (this.map.roadLinks.some((l) => [l.from.roadId, l.to.roadId].includes(roadId) && [l.from.roadId, l.to.roadId].includes(c.other.id))) continue;
      const pair = c.other.travelDirection !== "two-way" && c.other.roadNameId ? candidates.filter((other) => other.other.id !== c.other.id && other.other.roadNameId === c.other.roadNameId && other.other.travelDirection !== "two-way" && distance(other.point, c.point) < 50 && Math.abs(other.otherY - c.otherY) < 0.5) : [];
      const position = pair.length ? { x: (c.point.x + pair[0].point.x) / 2, y: c.point.y, z: (c.point.z + pair[0].point.z) / 2 } : c.point;
      const local = this.nearby(bounds([position], 35)).filter((o) => (project(roadPoints(o), position).distance < 0.3 || pair.some((p) => p.other.id === o.id) || o.id === c.other.id) && Math.abs((project(roadPoints(o), position).point.y ?? 0) - c.otherY) < 0.5);
      this.intersection(position, local.map((o) => o.id));
      handled.push(c.point, ...pair.map((p) => p.point));
    }
  }
  elevation(r, height, start, end, transition = 100, profile) {
    const pts = roadPoints(r), length = polylineLength(pts);
    if (start === void 0 && end === void 0 && !profile) {
      this.detach({ roadId: r.id, end: "start" });
      this.detach({ roadId: r.id, end: "end" });
      r.centerline = r.centerline.map((p) => ({ ...p, y: height }));
    } else {
      const a = start ?? 0, b = end ?? length;
      if (a < 0 || b > length || a >= b || transition <= 0) throw new Error("Elevation section requires 0 \u2264 start < end \u2264 road length and positive transition");
      if (profile && (profile.length < 2 || profile.some((p, i) => !Number.isFinite(p.distance) || !Number.isFinite(p.height) || p.distance < 0 || p.distance > length || i > 0 && p.distance <= profile[i - 1].distance))) throw new Error("Profile needs increasing distances within the road");
      const stations3 = /* @__PURE__ */ new Set([0, length, a, b, Math.max(0, a - transition), Math.min(length, b + transition), ...profile?.map((p) => p.distance) ?? []]);
      for (let d = 0; d < length; d += 5) stations3.add(d);
      r.centerline = [...stations3].sort((x, y) => x - y).map((d) => {
        const p = sampleAt(pts, d).point;
        if (profile) {
          const sorted = profile;
          const i = Math.max(0, sorted.findIndex((p2) => p2.distance >= d));
          const right = sorted[i], left = sorted[Math.max(0, i - 1)];
          p.y = d >= sorted.at(-1).distance ? sorted.at(-1).height : left.height + (right.height - left.height) * (right.distance === left.distance ? 0 : (d - left.distance) / (right.distance - left.distance));
        } else {
          const t = d < a ? Math.max(0, 1 - (a - d) / transition) : d > b ? Math.max(0, 1 - (d - b) / transition) : 1;
          const s = t * t * (3 - 2 * t);
          p.y = (p.y ?? 0) + (height - (p.y ?? 0)) * s;
        }
        return p;
      });
      r.curve = "polyline";
      if (Math.abs((r.centerline[0].y ?? 0) - (pts[0].y ?? 0)) > 0.01) this.detach({ roadId: r.id, end: "start" });
      if (Math.abs((r.centerline.at(-1).y ?? 0) - (pts.at(-1).y ?? 0)) > 0.01) this.detach({ roadId: r.id, end: "end" });
    }
    r.elevationMode = "custom";
    r.elevation = height;
    r.structure = { ...r.structure, piersEnabled: height > 2.5, barrierEnabled: height !== 0, ...height < 0 ? { enclosure: { kind: "cutting", clearance: 5.5 } } : {} };
    if (height >= 0 && r.structure.enclosure?.kind === "cutting") delete r.structure.enclosure;
  }
  delete(id) {
    this.assertUnlocked(id);
    this.detach({ roadId: id, end: "start" });
    this.detach({ roadId: id, end: "end" });
    this.map.roads = this.map.roads.filter((r) => r.id !== id);
    this.map.objects = this.map.objects.filter((o) => o.id !== id);
    this.map.intersections = this.map.intersections.filter((j) => j.id !== id);
    this.map.connectionPorts = this.map.connectionPorts.filter((p) => p.endpoint.roadId !== id);
    if (this.map.signs) this.map.signs = this.map.signs.filter((s) => s.roadId !== id).map((s) => {
      if (s.incomingRoadId !== id && !s.outgoingRoadIds?.includes(id)) return s;
      this.changed.add(s.id);
      return { ...s, incomingRoadId: s.incomingRoadId === id ? void 0 : s.incomingRoadId, outgoingRoadIds: s.outgoingRoadIds?.filter((r) => r !== id) };
    });
    this.remapCollections(id, []);
    for (const c of editing(this.map).corridors) c.roadIds = c.roadIds.filter((r) => r !== id);
    for (const g of editing(this.map).groups) g.memberIds = g.memberIds.filter((r) => r !== id);
    editing(this.map).attachments = editing(this.map).attachments.filter((a) => a.roadId !== id && a.sourceRoadId !== id);
    editing(this.map).ramps = editing(this.map).ramps.filter((r) => r.roadId !== id && r.from.roadId !== id && r.to.roadId !== id);
    if (editing(this.map).curves?.[id]) delete editing(this.map).curves[id];
    this.changed.add(id);
  }
  directionalInterchange(c) {
    const groupId = this.id(c.parameters.groupId ?? "directional-t"), height = c.parameters.mainElevation ?? 8;
    const mainIn = this.addRoad({ op: "createRoad", id: `${groupId}-northbound`, preset: "expressway6", points: [{ x: 8, y: height, z: 600 }, { x: 8, y: height, z: -600 }], properties: { laneCount: 3, travelDirection: "forward" } });
    const mainOut = this.addRoad({ op: "createRoad", id: `${groupId}-southbound`, preset: "expressway6", points: [{ x: -8, y: height, z: -600 }, { x: -8, y: height, z: 600 }], properties: { laneCount: 3, travelDirection: "forward" } });
    const branchOut = this.addRoad({ op: "createRoad", id: `${groupId}-branch-out`, preset: "expressway6", points: [{ x: 100, y: 0, z: 8 }, { x: 650, y: 0, z: 8 }], properties: { laneCount: 2, travelDirection: "forward" } });
    const branchIn = this.addRoad({ op: "createRoad", id: `${groupId}-branch-in`, preset: "expressway6", points: [{ x: 650, y: 0, z: -8 }, { x: 100, y: 0, z: -8 }], properties: { laneCount: 2, travelDirection: "forward" } });
    const families = [mainIn.id, mainOut.id, branchOut.id, branchIn.id];
    const locate = (family, point) => {
      const candidates = this.map.roads.filter((r) => r.id === family || r.id.startsWith(family + "-section")).map((r) => ({ id: r.id, q: project(roadPoints(r), point) })).sort((a, b) => a.q.distance - b.q.distance);
      return candidates[0];
    };
    const movements = [{ a: mainIn.id, p: { x: 8, y: height, z: 400 }, b: branchOut.id, q: { x: 300, y: 0, z: 8 }, kind: "off" }, { a: mainOut.id, p: { x: -8, y: height, z: -400 }, b: branchOut.id, q: { x: 400, y: 0, z: 8 }, kind: "off" }, { a: branchIn.id, p: { x: 400, y: 0, z: -8 }, b: mainIn.id, q: { x: 8, y: height, z: -400 }, kind: "on" }, { a: branchIn.id, p: { x: 300, y: 0, z: -8 }, b: mainOut.id, q: { x: -8, y: height, z: 400 }, kind: "on" }];
    const initial = new Set(this.map.roads.map((r) => r.id));
    for (const movement of movements) {
      const a = locate(movement.a, movement.p), b = locate(movement.b, movement.q);
      this.execute({ op: "createRamp", fromRoadId: a.id, toRoadId: b.id, fromDistance: a.q.along, toDistance: b.q.along, kind: movement.kind, lanes: c.parameters.rampLaneCount ?? 1 });
    }
    for (const r of [...this.map.roads]) if ((r.id === branchOut.id || r.id.startsWith(branchOut.id + "-section")) && Math.abs(r.centerline[0].x - 100) < 0.01 || (r.id === branchIn.id || r.id.startsWith(branchIn.id + "-section")) && Math.abs(r.centerline.at(-1).x - 100) < 0.01) this.delete(r.id);
    const ids = /* @__PURE__ */ new Set([...families.filter((id) => this.map.roads.some((r) => r.id === id)), ...this.map.roads.filter((r) => !initial.has(r.id)).map((r) => r.id)]), angle = c.parameters.rotation ?? 0, position = c.parameters.position ?? { x: 0, y: 0, z: 0 };
    const transform = (p) => ({ x: position.x + p.x * Math.cos(angle) + p.z * Math.sin(angle), y: (position.y ?? 0) + (p.y ?? 0), z: position.z - p.x * Math.sin(angle) + p.z * Math.cos(angle) });
    for (const r of this.map.roads) if (ids.has(r.id)) {
      r.groupId = groupId;
      r.centerline = r.centerline.map(transform);
      if (editing(this.map).curves?.[r.id]) editing(this.map).curves[r.id] = editing(this.map).curves[r.id].map(transform);
    }
    editing(this.map).groups.push({ id: groupId, name: "Directional T / Y", kind: "interchange", memberIds: [...ids], locked: false });
    this.changed.add(groupId);
    for (const id of families) for (const end of ["start", "end"]) {
      const parts = this.map.roads.filter((r) => r.id === id || r.id.startsWith(id + "-section"));
      const target = end === "start" ? parts[0] : parts.at(-1);
      const e = { roadId: target.id, end };
      if (!this.map.roadLinks.some((l) => sameEnd(l.from, e) || sameEnd(l.to, e))) this.map.connectionPorts.push({ id: this.id("port"), label: `${id} ${end}`, endpoint: e, groupId });
    }
  }
  /** Rebuild one junction from its real approach mouths, without deleting it. */
  repairJunction(j, options = {}) {
    const margin = options.approachMargin ?? 3.2;
    const readArms = () => j.connections.flatMap((c) => {
      const r = this.map.roads.find((r2) => r2.id === c.roadId);
      if (!r) return [];
      const pts = roadPoints(r), start = c.end === "start";
      const mouth = start ? pts[0] : pts.at(-1);
      const neighbour = start ? pts[1] ?? pts[0] : pts.at(-2) ?? pts.at(-1);
      const dx = neighbour.x - mouth.x, dz = neighbour.z - mouth.z, length = Math.hypot(dx, dz) || 1;
      const half = r.laneCount * r.laneWidth / 2 + Math.max(r.shoulders?.left ?? 0, r.shoulders?.right ?? 0);
      return [{ c, r, pts, start, mouth, outward: { x: dx / length, z: dz / length }, half, along: 0 }];
    });
    let arms = readArms();
    const before = arms.map((a) => ({ roadId: a.r.id, along: Math.round((a.mouth.x - j.position.x) * a.outward.x + (a.mouth.z - j.position.z) * a.outward.z) }));
    for (const arm of arms) arm.along = (arm.mouth.x - j.position.x) * arm.outward.x + (arm.mouth.z - j.position.z) * arm.outward.z;
    const needs = /* @__PURE__ */ new Map();
    for (const arm of arms) {
      let needed = 8;
      for (const other of arms) {
        if (other.r.id === arm.r.id && other.c.end === arm.c.end) continue;
        const cross = arm.outward.x * other.outward.z - arm.outward.z * other.outward.x;
        if (Math.abs(cross) < 0.2) continue;
        const px2 = other.mouth.x - j.position.x, pz2 = other.mouth.z - j.position.z;
        const along = Math.abs((px2 * other.outward.z - pz2 * other.outward.x) / cross);
        needed = Math.max(needed, along + other.half / Math.abs(cross) + margin);
      }
      needs.set(`${arm.r.id}:${arm.c.end}`, Math.max(8, Math.min(80, needed)));
    }
    for (const arm of arms) {
      const needed = needs.get(`${arm.r.id}:${arm.c.end}`);
      if (needed <= arm.along + 0.05) continue;
      const delta = needed - arm.along;
      if (polylineLength(arm.pts) - delta < 8) continue;
      const outwardPath = arm.start ? arm.pts : [...arm.pts].reverse();
      const kept = slicePath(outwardPath, delta, polylineLength(outwardPath));
      const r = this.road(arm.r.id);
      r.centerline = arm.start ? kept : kept.reverse();
      r.curve = "polyline";
      r.elevationMode = "custom";
      this.changed.add(r.id);
      if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
    }
    arms = readArms();
    j.portAngles = {};
    j.approachOffsets = {};
    j.pavementHeights = {};
    for (const arm of arms) {
      if (arm.c.port === void 0) continue;
      const localMouth = rotatePoint({ x: arm.mouth.x - j.position.x, z: arm.mouth.z - j.position.z }, -j.rotation);
      j.portAngles[arm.c.port] = Math.atan2(arm.outward.x, -arm.outward.z) + j.rotation;
      j.approachOffsets[arm.c.port] = { x: localMouth.x, y: (arm.mouth.y ?? 0) - (j.position.y ?? 0), z: localMouth.z };
      j.pavementHeights[arm.c.port] = arm.mouth.y ?? j.position.y ?? 0;
    }
    delete j.approaches;
    setJunctionPavementFootprint(j, this.map);
    if (options.rebuildMarkings !== false) populateIntersectionMarkingMetadata({ ...this.map, intersections: [j] });
    const after = arms.map((a) => ({ roadId: a.r.id, along: Math.round((a.mouth.x - j.position.x) * a.outward.x + (a.mouth.z - j.position.z) * a.outward.z) }));
    const area = (j.pavementFootprint ?? []).reduce((sum, p, i, list) => {
      const q = list[(i + 1) % list.length];
      return sum + p.x * q.z - q.x * p.z;
    }, 0) / 2;
    return { arms: arms.length, beforeApproachExtents: before, afterApproachExtents: after, footprintPoints: j.pavementFootprint?.length ?? 0, pavementArea: Math.round(Math.abs(area)) };
  }
  execute(c) {
    invalidateAnalysis(this.map);
    switch (c.op) {
      case "modifyMap": {
        Object.assign(this.map, structuredClone(c.properties));
        if (c.spawn) this.map.environment = { ...this.map.environment, spawnPoints: [{ ...this.map.environment.spawnPoints[0], ...structuredClone(c.spawn) }, ...this.map.environment.spawnPoints.slice(1)] };
        break;
      }
      case "createRoad": {
        const r = this.addRoad(c);
        this.autoConnect(r.id, c.crossing ?? "intersection");
        break;
      }
      case "extendRoad": {
        const r = this.road(c.roadId);
        this.detach({ roadId: r.id, end: c.end });
        r.centerline = c.end === "end" ? [...r.centerline, ...structuredClone(c.points)] : [...structuredClone(c.points), ...r.centerline];
        if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
        this.autoConnect(r.id, c.crossing ?? "intersection");
        break;
      }
      case "moveRoad":
      case "moveCorridor": {
        const roads = this.roadsFor(c.id), ids = new Set(roads.map((r) => r.id));
        for (const a of editing(this.map).attachments) if (ids.has(a.sourceRoadId)) {
          ids.add(a.roadId);
          roads.push(this.road(a.roadId));
        }
        for (const j of this.map.intersections) if (j.connections.length && j.connections.every((e) => ids.has(e.roadId))) {
          const w = this.junction(j.id);
          w.position = { x: w.position.x + c.delta.x, y: (w.position.y ?? 0) + (c.delta.y ?? 0), z: w.position.z + c.delta.z };
        }
        for (const r of roads) {
          for (const end of ["start", "end"]) {
            const e = { roadId: r.id, end };
            const owned = this.map.intersections.some((j) => j.connections.some((o) => sameEnd(o, e)) && j.connections.every((o) => ids.has(o.roadId)));
            if (!owned) {
              for (const j of this.map.intersections) if (j.connections.some((o) => sameEnd(o, e))) this.junction(j.id).connections = j.connections.filter((o) => !sameEnd(o, e));
            }
          }
          r.centerline = roadPoints({ ...r, curve: "polyline" }).map((p) => ({ x: p.x + c.delta.x, y: (p.y ?? 0) + (c.delta.y ?? 0), z: p.z + c.delta.z }));
          r.elevationMode = "custom";
          const controls = editing(this.map).curves?.[r.id];
          if (controls) editing(this.map).curves[r.id] = controls.map((p) => ({ x: p.x + c.delta.x, y: (p.y ?? 0) + (c.delta.y ?? 0), z: p.z + c.delta.z }));
        }
        this.map.roadLinks = this.map.roadLinks.filter((l) => ids.has(l.from.roadId) === ids.has(l.to.roadId));
        break;
      }
      case "editControlPoint": {
        const r = this.road(c.roadId), controls = editing(this.map).curves?.[r.id];
        if (controls) {
          if (!controls[c.index]) throw new Error("Control handle missing");
          if (c.index === 0 || c.index === 3) throw new Error("Move ramp merge points through road connections; edit its two tangent handles");
          controls[c.index] = { ...c.point };
          r.centerline = cubicPath(controls);
        } else {
          if (!r.centerline[c.index]) throw new Error("Control point index missing");
          const isEnd = c.index === 0 || c.index === r.centerline.length - 1;
          if (isEnd) this.detach({ roadId: r.id, end: c.index === 0 ? "start" : "end" });
          r.centerline = roadPoints({ ...r, curve: "polyline" });
          r.centerline[c.index] = { ...c.point };
          r.elevationMode = "custom";
          if (isEnd) this.autoConnect(r.id, "intersection");
        }
        break;
      }
      case "splitRoad":
        this.split(c.roadId, c.point);
        break;
      case "mergeRoads": {
        const a = this.road(c.roadIds[0]), b = this.road(c.roadIds[1]);
        if (a.id === b.id || distance(endpoint(this.map, { roadId: a.id, end: "end" }), endpoint(this.map, { roadId: b.id, end: "start" })) > 0.2 || a.laneCount !== b.laneCount || a.laneWidth !== b.laneWidth || a.travelDirection !== b.travelDirection || roadFunction(a) !== roadFunction(b)) throw new Error("Merge requires compatible ordered end/start roads");
        if (Math.abs((roadPoints(a).at(-1).y ?? 0) - (roadPoints(b)[0].y ?? 0)) > 0.2) throw new Error("Merge endpoints must share elevation");
        if (this.map.intersections.some((j) => j.connections.some((e) => e.roadId === a.id && e.end === "end" || e.roadId === b.id && e.end === "start")) || this.map.roadLinks.some((l) => [l.from, l.to].some((e) => e.roadId === b.id && e.end === "start" || e.roadId === a.id && e.end === "end") && [l.from, l.to].some((e) => e.roadId !== a.id && e.roadId !== b.id))) throw new Error("Merge would remove a branching or intersection connection");
        const aLength = polylineLength(roadPoints(a));
        if (!a.roadNameId && b.roadNameId) a.roadNameId = b.roadNameId;
        a.centerline = [...roadPoints(a), ...roadPoints(b).slice(1)];
        a.curve = "polyline";
        a.elevationMode = "custom";
        if (editing(this.map).curves?.[a.id]) delete editing(this.map).curves[a.id];
        this.map.signs = this.map.signs.map((sign) => {
          if (sign.roadId !== b.id) return sign;
          this.changed.add(sign.id);
          return { ...sign, roadId: a.id, stationMetres: (sign.stationMetres ?? project(roadPoints(b), sign.position).along) + aLength, incomingRoadId: sign.incomingRoadId === b.id ? a.id : sign.incomingRoadId };
        });
        this.detach({ roadId: a.id, end: "end" });
        this.detach({ roadId: b.id, end: "start" });
        this.remapEnd(b.id, a.id);
        this.remapCollections(b.id, [a.id]);
        for (const corridor of editing(this.map).corridors) corridor.roadIds = [...new Set(corridor.roadIds.map((id) => id === b.id ? a.id : id))];
        for (const group of editing(this.map).groups) group.memberIds = [...new Set(group.memberIds.map((id) => id === b.id ? a.id : id))];
        this.map.signs = this.map.signs.map((s) => s.incomingRoadId === b.id || s.outgoingRoadIds?.includes(b.id) ? { ...s, incomingRoadId: s.incomingRoadId === b.id ? a.id : s.incomingRoadId, outgoingRoadIds: s.outgoingRoadIds?.map((id) => id === b.id ? a.id : id) } : s);
        this.delete(b.id);
        break;
      }
      case "connectRoads":
        this.road(c.from.roadId);
        this.road(c.to.roadId);
        this.link(c.from, c.to);
        break;
      case "deleteRoad":
      case "deleteObject":
        this.delete(c.id);
        break;
      case "createCorridor": {
        for (const id2 of c.roadIds) this.road(id2);
        const id = this.id(c.id ?? "corridor", !!c.id);
        editing(this.map).corridors.push({ id, name: c.name, roadIds: [...new Set(c.roadIds)], district: c.district });
        this.changed.add(id);
        break;
      }
      case "createParallelRoad":
      case "generateFrontageRoads": {
        if (!Number.isFinite(c.offset) || c.offset <= 0) throw new Error("Offset must be positive");
        const sources = [...this.roadsFor(c.id)], sides = c.op === "generateFrontageRoads" && c.side === "both" ? ["left", "right"] : [c.side];
        for (const side of sides) {
          const ids = [];
          for (const source2 of sources) {
            const offset = c.offset * (side === "left" ? -1 : 1), r = this.addRoad({ op: "createRoad", preset: c.preset ?? (c.op === "generateFrontageRoads" ? "frontage2" : "local"), points: parallelPath(source2, offset).map((p) => c.elevation === void 0 ? p : { ...p, y: c.elevation }), properties: { curve: "polyline", ...c.op === "generateFrontageRoads" ? { roadClass: "frontage" } : {} } });
            ids.push(r.id);
            if (c.offset < (source2.laneCount * source2.laneWidth + r.laneCount * r.laneWidth) / 2) this.notes.push({ severity: "warning", code: "parallel.overlap", ids: [source2.id, r.id], message: "Parallel pavement overlaps the source; increase offset unless this is intentional" });
            if (c.op === "generateFrontageRoads" || c.attached) editing(this.map).attachments.push({ id: this.id("attachment"), sourceRoadId: source2.id, roadId: r.id, offset });
          }
          const id = this.id("parallel-corridor");
          editing(this.map).corridors.push({ id, name: `${c.id} ${side}`, roadIds: ids });
          this.changed.add(id);
          for (let i = 1; i < ids.length; i++) {
            const from = { roadId: ids[i - 1], end: "end" }, to = { roadId: ids[i], end: "start" };
            if (distance(endpoint(this.map, from), endpoint(this.map, to)) < 0.2) this.link(from, to);
          }
        }
        break;
      }
      case "detach": {
        const ids = new Set(this.roadsFor(c.id).map((r) => r.id));
        editing(this.map).attachments = editing(this.map).attachments.filter((a) => !ids.has(a.roadId));
        break;
      }
      case "createRamp": {
        if (c.fromRoadId === c.toRoadId) throw new Error("Select distinct ramp roads");
        const fromRoad = this.road(c.fromRoadId), toRoad = this.road(c.toRoadId), fp = roadPoints(fromRoad), tp = roadPoints(toRoad);
        if (c.fromDistance < 0 || c.fromDistance > polylineLength(fp) || c.toDistance < 0 || c.toDistance > polylineLength(tp)) throw new Error("Ramp distances are outside road lengths");
        const a = sampleAt(fp, c.fromDistance), b = sampleAt(tp, c.toDistance), span = distance(a.point, b.point), handle = Math.max(25, span * 0.4);
        if (span < 10) throw new Error("Ramp endpoints need at least 10m separation");
        const signA = fromRoad.travelDirection === "reverse" ? -1 : 1, signB = toRoad.travelDirection === "reverse" ? -1 : 1;
        const controls = [a.point, { x: a.point.x + a.tangent.x * handle * signA, y: a.point.y, z: a.point.z + a.tangent.z * handle * signA }, { x: b.point.x - b.tangent.x * handle * signB, y: b.point.y, z: b.point.z - b.tangent.z * handle * signB }, b.point];
        const points = cubicPath(controls);
        const fromCut = this.split(fromRoad.id, a.point), toCut = this.split(toRoad.id, b.point);
        const from = signA > 0 ? fromCut.from : fromCut.to, to = signB > 0 ? toCut.to : toCut.from;
        const r = this.addRoad({ op: "createRoad", id: c.id, preset: c.lanes === 2 ? "ramp2" : "ramp1", points, properties: { curve: "polyline", structure: { barrierEnabled: true, piersEnabled: true, pierSpacing: 30 } } });
        this.link(from, { roadId: r.id, end: "start" });
        this.link({ roadId: r.id, end: "end" }, to);
        (editing(this.map).curves ??= {})[r.id] = structuredClone(controls);
        editing(this.map).ramps.push({ id: this.id(`${r.id}-ramp`), roadId: r.id, kind: c.kind, from, to });
        break;
      }
      case "modifyRamp": {
        const ramp = editing(this.map).ramps.find((r2) => r2.id === c.id || r2.roadId === c.id);
        if (!ramp) throw new Error("Missing ramp");
        const r = this.road(ramp.roadId);
        if (c.from || c.to) {
          if (c.points) throw new Error("Use attachment stations or control points in a single ramp edit");
          const attachment = (request, existing, source2) => {
            if (!request) return { ...existing };
            if (request.roadId === r.id) throw new Error("Ramp cannot attach to itself");
            const receiving = this.road(request.roadId), path = roadPoints(receiving), length = polylineLength(path);
            if (!Number.isFinite(request.station) || request.station < 0 || request.station > length) throw new Error("Ramp attachment station is outside receiving road");
            const cut = this.split(receiving.id, sampleAt(path, request.station).point), forward = receiving.travelDirection !== "reverse";
            return source2 === forward ? cut.from : cut.to;
          };
          const from = attachment(c.from, ramp.from, true), to = attachment(c.to, ramp.to, false);
          const a = endpoint(this.map, from), b = endpoint(this.map, to), span = distance(a, b);
          if (span < 10) throw new Error("Ramp endpoints need at least 10m separation");
          const tangent = (e) => {
            const road = this.map.roads.find((r2) => r2.id === e.roadId), path = roadPoints(road), s = sampleAt(path, e.end === "start" ? 0 : polylineLength(path));
            return { x: s.tangent.x * (road.travelDirection === "reverse" ? -1 : 1), z: s.tangent.z * (road.travelDirection === "reverse" ? -1 : 1) };
          };
          const u = tangent(from), v = tangent(to), h = Math.max(25, span * 0.4), controls = [a, { x: a.x + u.x * h, y: a.y, z: a.z + u.z * h }, { x: b.x - v.x * h, y: b.y, z: b.z - v.z * h }, b];
          this.detach({ roadId: r.id, end: "start" });
          this.detach({ roadId: r.id, end: "end" });
          ramp.from = { ...from };
          ramp.to = { ...to };
          r.centerline = cubicPath(controls);
          r.curve = "polyline";
          r.elevationMode = "custom";
          (editing(this.map).curves ??= {})[r.id] = structuredClone(controls);
          this.link(from, { roadId: r.id, end: "start" });
          this.link({ roadId: r.id, end: "end" }, to);
        }
        if (c.points) {
          const a = endpoint(this.map, ramp.from), b = endpoint(this.map, ramp.to);
          if (distance(c.points[0], a) > 0.2 || distance(c.points.at(-1), b) > 0.2) throw new Error("Ramp endpoint edits must preserve merge connections");
          r.centerline = c.points.length === 4 ? cubicPath(c.points) : structuredClone(c.points);
          if (c.points.length === 4) (editing(this.map).curves ??= {})[r.id] = structuredClone(c.points);
          else if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
        }
        if (c.lanes) r.laneCount = c.lanes;
        if (c.kind) ramp.kind = c.kind;
        break;
      }
      case "createIntersection":
        this.intersection(c.position, c.roadIds ?? this.nearby(bounds([c.position], 3)).filter((r) => project(roadPoints(r), c.position).distance < 0.3).map((r) => r.id), c.signalized, c.id);
        break;
      case "modifyIntersection": {
        const j = this.junction(c.id);
        for (const e of [...j.connections, ...c.properties.connections ?? []]) this.road(e.roadId);
        Object.assign(j, structuredClone(c.properties));
        break;
      }
      case "changeRoadClass":
        for (const r of this.roadsFor(c.id)) r.roadClass = c.roadClass;
        break;
      case "changeCrossSection":
        for (const r of this.roadsFor(c.id)) Object.assign(r, structuredClone(EDITOR_ROAD_PRESETS[c.preset].properties), structuredClone(c.properties), { type: void 0 });
        break;
      case "setElevationProfile":
        for (const r of this.roadsFor(c.id)) {
          this.elevation(r, c.height, c.start, c.end, c.transition, c.profile);
          if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
        }
        break;
      case "modifyRoad":
        for (const r of this.roadsFor(c.id)) Object.assign(r, structuredClone(c.properties));
        break;
      case "placePreset":
      case "createInterchange": {
        if (c.op === "createInterchange" && c.template === "directional-t") {
          this.directionalInterchange(c);
          break;
        }
        const presetId = c.op === "placePreset" ? c.presetId : { "compact-diamond": "diamond_interchange", diamond: "diamond_interchange", "directional-t": "trumpet_interchange", "ramp-pair": "urban_side_access" }[c.template];
        const defaults = c.op === "createInterchange" && c.template === "compact-diamond" ? { length: 780, rampRadius: 80 } : {};
        const groupId = this.id(c.parameters.groupId ?? presetId), stamp = expandPreset(presetId, { ...defaults, ...c.parameters, groupId });
        const names = /* @__PURE__ */ new Map();
        for (const e of [...stamp.roads, ...stamp.intersections, ...stamp.objects, ...stamp.roadLinks, ...stamp.connectionPorts]) {
          const previous = e.id;
          e.id = this.id(previous);
          names.set(previous, e.id);
          this.changed.add(e.id);
        }
        const remap = (e) => {
          e.roadId = names.get(e.roadId) ?? e.roadId;
        };
        for (const j of stamp.intersections) for (const e of j.connections) remap(e);
        for (const l of stamp.roadLinks) {
          remap(l.from);
          remap(l.to);
        }
        for (const p of stamp.connectionPorts) remap(p.endpoint);
        this.map.roads.push(...stamp.roads);
        this.map.intersections.push(...stamp.intersections);
        this.map.objects.push(...stamp.objects);
        this.map.roadLinks.push(...stamp.roadLinks);
        this.map.connectionPorts.push(...stamp.connectionPorts);
        editing(this.map).groups.push({ id: groupId, name: presetId, kind: "interchange", locked: false, memberIds: [...stamp.roads, ...stamp.intersections, ...stamp.objects].map((e) => e.id) });
        this.changed.add(groupId);
        break;
      }
      case "createGroup": {
        const members = [...new Set(c.memberIds.flatMap((id2) => editing(this.map).corridors.find((c2) => c2.id === id2)?.roadIds ?? editing(this.map).groups.find((g) => g.id === id2)?.memberIds ?? [id2]))];
        for (const id2 of members) {
          this.assertUnlocked(id2);
          if (![...this.map.roads, ...this.map.intersections, ...this.map.objects].some((e) => e.id === id2)) throw new Error(`Missing group member ${id2}`);
        }
        const id = this.id(c.id ?? "group", !!c.id);
        editing(this.map).groups.push({ id, name: c.name, kind: c.kind, memberIds: members, locked: false });
        this.changed.add(id);
        break;
      }
      case "setLocked": {
        const group = editing(this.map).groups.find((g) => g.id === c.id);
        if (!group) throw new Error("Missing group");
        group.locked = c.locked;
        this.changed.add(group.id);
        break;
      }
      case "placeObject": {
        const fragment = newCityMap(), o = placePrefab(fragment, { ...c.properties, id: this.id(c.properties.id ?? c.properties.prefabId, !!c.properties.id) });
        this.map.objects.push(o);
        this.changed.add(o.id);
        break;
      }
      case "modifyObject": {
        this.assertUnlocked(c.id);
        const i = this.map.objects.findIndex((o) => o.id === c.id);
        if (i < 0) throw new Error("Missing object");
        this.map.objects[i] = { ...structuredClone(this.map.objects[i]), ...structuredClone(c.properties) };
        this.changed.add(c.id);
        break;
      }
      case "setRoadName": {
        const roads = this.roadsFor(c.id), oldIds = new Set(roads.map((r) => r.roadNameId).filter((id) => !!id && id !== c.nameId));
        this.map.roadNames = { ...this.map.roadNames, [c.nameId]: { ...this.map.roadNames?.[c.nameId], ...structuredClone(c.entry) } };
        for (const r of roads) {
          r.roadNameId = c.nameId;
          delete r.displayName;
          this.changed.add(r.id);
        }
        this.remapSignNames(oldIds, c.nameId);
        break;
      }
      case "setCorridorName": {
        const roads = c.roadIds?.length ? c.roadIds.map((id) => this.road(id)) : this.roadsFor(c.id);
        const existing = roads.map((r) => r.roadNameId).filter((id) => !!id);
        const nameId = c.nameId ?? (existing.length && existing.every((id) => id === existing[0]) ? existing[0] : `name:${c.id}`);
        const entry = { ...this.map.roadNames?.[nameId], primaryText: c.name, kind: c.kind ?? this.map.roadNames?.[nameId]?.kind ?? (roads.some((r) => roadFunction(r) === "expressway") ? "expressway" : "urban") };
        this.map.roadNames = { ...this.map.roadNames, [nameId]: entry };
        const oldIds = new Set(existing.filter((id) => id !== nameId));
        for (const r of roads) {
          r.roadNameId = nameId;
          delete r.displayName;
          this.changed.add(r.id);
        }
        const corridor = editing(this.map).corridors.find((corridor2) => corridor2.id === c.id);
        if (corridor) corridor.name = c.name;
        this.remapSignNames(oldIds, nameId);
        this.record(c.id, { nameId, roads: roads.length, name: c.name });
        break;
      }
      case "smoothRoad": {
        for (const r of this.roadsFor(c.id)) {
          const source2 = roadPoints(r), result = smoothAlignment(source2, { start: c.start, end: c.end, strength: c.strength, preserveEndpoints: c.preserveEndpoints, simplifyTolerance: c.tolerance });
          const partial = (c.start ?? 0) > 0 || (c.end ?? Infinity) < polylineLength(source2);
          const ramp = roadFunction(r) === "ramp";
          r.centerline = result.points.map((point) => ({ ...point }));
          r.curve = partial ? "polyline" : r.curve === "smooth" || ramp ? "smooth" : "polyline";
          if (editing(this.map).curves?.[r.id]) {
            if (ramp && !partial) {
              const handles = cubicHandles(result.points);
              editing(this.map).curves[r.id] = handles;
              r.centerline = cubicPath(handles);
              r.curve = "polyline";
            } else delete editing(this.map).curves[r.id];
          }
          this.changed.add(r.id);
          this.record(r.id, { smooth: result.metrics });
        }
        break;
      }
      case "repairElevation": {
        for (const r of this.roadsFor(c.id)) {
          const partial = (c.start ?? 0) > 0 || (c.end ?? Infinity) < polylineLength(roadPoints(r));
          const constrained = repairConstrainedProfile(analysisContext(this.map), r.id, { ...c, simplifyTolerance: c.tolerance });
          const result = { points: constrained.points, metrics: { ...constrained.metrics, beforeMaxGrade: constrained.metrics.before.maxGrade * 100, afterMaxGrade: constrained.metrics.after.maxGrade * 100, beforeGradeReversals: constrained.metrics.before.extremaCount, afterGradeReversals: constrained.metrics.after.extremaCount } };
          r.centerline = result.points.map((point) => ({ ...point }));
          r.curve = !partial && r.curve === "smooth" ? "smooth" : "polyline";
          r.elevationMode = "custom";
          if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
          this.changed.add(r.id);
          this.record(r.id, { elevation: result.metrics });
        }
        break;
      }
      case "simplifyRoad": {
        for (const r of this.roadsFor(c.id)) {
          const source2 = roadPoints(r), simplified = simplifyPoints(source2, c.tolerance ?? 0.25, 0.04);
          r.centerline = simplified.map((point) => ({ ...point }));
          r.curve = "polyline";
          if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
          this.changed.add(r.id);
          this.record(r.id, { simplify: { beforePoints: source2.length, afterPoints: simplified.length, removedControlPoints: Math.max(0, source2.length - simplified.length) } });
        }
        break;
      }
      case "repairRamp": {
        const ramp = editing(this.map).ramps.find((entry) => entry.id === c.id || entry.roadId === c.id);
        const r = ramp ? this.road(ramp.roadId) : this.road(c.id);
        if (c.start !== void 0 || c.end !== void 0 || c.strategy || c.anchors || analysisContext(this.map).hardConstraints(r.id).some((a) => a.kind !== "endpoint")) {
          const result = repairConstrainedProfile(analysisContext(this.map), r.id, c);
          r.centerline = result.points;
          r.curve = "polyline";
          r.elevationMode = "custom";
          if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves[r.id];
          this.record(r.id, { ramp: result.metrics });
          this.changed.add(r.id);
          break;
        }
        const source2 = roadPoints(r);
        const aligned = smoothAlignment(source2, { strength: Math.max(1.1, c.strength ?? 1.25), preserveEndpoints: true, simplifyTolerance: 0.9 });
        const net = Math.abs((aligned.points.at(-1)?.y ?? 0) - (aligned.points[0]?.y ?? 0));
        let variation = 0;
        for (let i = 1; i < aligned.points.length; i++) variation += Math.abs((aligned.points[i].y ?? 0) - (aligned.points[i - 1].y ?? 0));
        const vertical = repairElevation(aligned.points, { strength: Math.max(1.2, c.strength ?? 1.5), preserveEndpoints: true, maxGrade: c.maxGrade ?? 0.08, monotonic: c.monotonic ?? (net > 1.2 && variation < net * 2.5) });
        let points = vertical.points;
        if (editing(this.map).curves?.[r.id]) {
          const handles = cubicHandles(points);
          editing(this.map).curves[r.id] = handles;
          points = cubicPath(handles);
        }
        r.centerline = points.map((point) => ({ ...point }));
        r.curve = "polyline";
        r.elevationMode = "custom";
        this.changed.add(r.id);
        const finalGrade = gradeMetrics(points);
        this.record(r.id, { ramp: { ...aligned.metrics, ...vertical.metrics, afterMaxGrade: Math.round(finalGrade.maxGrade * 1e3) / 10, afterGradeReversals: finalGrade.reversals } });
        break;
      }
      case "repairIntersection": {
        const j = this.junction(c.id), metrics = this.repairJunction(j, { rebuildFootprint: c.rebuildFootprint, rebuildMarkings: c.rebuildMarkings, approachMargin: c.approachMargin });
        this.record(j.id, { intersection: metrics });
        break;
      }
      case "repairIntersections": {
        const ids = new Set(c.intersectionIds ?? []);
        if (!ids.size) {
          if (!c.bbox) throw new Error("repairIntersections requires a bbox or explicit intersectionIds");
          const report = diagnoseMap(this.map, { bbox: c.bbox, codes: c.codes ?? ["intersection.", "marking."], minSeverity: "warning", limit: c.limit ?? 40 }, {});
          for (const issue2 of report.issues) if (issue2.intersectionId && issue2.repair?.op === "repairIntersection") ids.add(issue2.intersectionId);
        }
        let repaired = 0;
        for (const id of [...ids].slice(0, c.limit ?? 20)) {
          try {
            this.repairJunction(this.junction(id), {});
            repaired++;
          } catch (error) {
            this.notes.push({ severity: "warning", code: "intersection.repairSkipped", ids: [id], message: String(error) });
          }
        }
        this.record("intersections", { repaired });
        break;
      }
      case "createSign": {
        const r = this.map.roads.find((r2) => r2.id === c.roadId);
        if (!r) throw new Error("Missing sign road");
        this.assertUnlocked(r.id);
        const pts = roadPoints(r), length = polylineLength(pts);
        if (c.station < 0 || c.station > length) throw new Error("Sign station lies outside road");
        const s = sampleAt(pts, c.station), offset = c.offset ?? r.laneCount * r.laneWidth / 2 + 2, direction = c.direction ?? "forward";
        const sign = { type: "ROAD_NAME", template: "urban-name", size: "small", language: "zh-CN", laneDirection: direction, destinations: r.roadNameId ? [{ roadNameId: r.roadNameId, arrow: "straight" }] : [], ...structuredClone(c.properties), id: this.id(c.id ?? "sign", !!c.id), roadId: r.id, stationMetres: c.station, position: { x: s.point.x - s.tangent.z * offset, y: s.point.y, z: s.point.z + s.tangent.x * offset }, heading: Math.atan2(-s.tangent.x, -s.tangent.z) + (direction === "reverse" ? Math.PI : 0) };
        if (c.properties.position) sign.position = { ...c.properties.position };
        if (c.properties.heading !== void 0) sign.heading = c.properties.heading;
        this.map.signs.push(sign);
        this.changed.add(sign.id);
        break;
      }
      case "modifySign": {
        const i = this.map.signs.findIndex((s) => s.id === c.id);
        if (i < 0) throw new Error("Missing sign");
        const old = this.map.signs[i];
        this.assertUnlocked(old.roadId);
        const sign = { ...structuredClone(old), ...structuredClone(c.properties) };
        if (c.properties.stationMetres !== void 0) {
          const road = this.map.roads.find((r) => r.id === sign.roadId);
          if (!road) throw new Error("Missing sign road");
          const pts = roadPoints(road), length = polylineLength(pts);
          if (sign.stationMetres < 0 || sign.stationMetres > length) throw new Error("Sign station outside road");
          const previous = project(pts, old.position), next = sampleAt(pts, sign.stationMetres), offset = (old.position.x - previous.point.x) * -previous.tangent.z + (old.position.z - previous.point.z) * previous.tangent.x;
          if (!c.properties.position) sign.position = { x: next.point.x - next.tangent.z * offset, y: next.point.y, z: next.point.z + next.tangent.x * offset };
          if (c.properties.heading === void 0) sign.heading += Math.atan2(next.tangent.x, next.tangent.z) - Math.atan2(previous.tangent.x, previous.tangent.z);
        }
        this.map.signs[i] = sign;
        this.changed.add(c.id);
        break;
      }
      case "deleteSign": {
        const sign = this.map.signs.find((s) => s.id === c.id);
        if (!sign) throw new Error("Missing sign");
        this.assertUnlocked(sign.roadId);
        this.map.signs = this.map.signs.filter((s) => s.id !== c.id);
        this.changed.add(c.id);
        break;
      }
      case "brushObjects": {
        const plan = planBrush(analysisContext(this.map), c.brush);
        this.record("brush", { request: plan.request, stats: plan.stats, candidates: plan.candidates });
        if (!plan.valid) {
          this.notes.push({ severity: "error", code: "brush.invalid", ids: [], message: "STRICT brush contains illegal candidates" });
          break;
        }
        for (const command of plan.operations) this.execute(command);
        break;
      }
      case "setSignalPlacement": {
        if (![c.position.x, c.position.y ?? 0, c.position.z, c.heading].every(Number.isFinite) || c.poleHeight !== void 0 && (!Number.isFinite(c.poleHeight) || c.poleHeight < 3 || c.poleHeight > 12)) throw new Error("Invalid signal placement or pole height");
        const j = this.junction(c.intersectionId);
        if (!j.connections.some((a) => a.port === c.approach)) throw new Error("Signal must have an authored approach");
        if (j.signals?.profile && c.poleHeight !== void 0 && c.poleHeight < 7.2) throw new Error("Profiled signal geometry requires pole height >=7.2m");
        j.signalized = true;
        j.signals = { ...j.signals, placements: { ...j.signals?.placements, [c.approach]: { position: { ...c.position }, heading: c.heading, ...c.poleHeight !== void 0 ? { headHeight: c.poleHeight } : {} } } };
        this.changed.add(`signal:${j.id}:${c.approach}`);
        break;
      }
      case "reanchorObject": {
        for (const command of reanchorCommands(analysisContext(this.map), c.id, c)) this.execute(command);
        break;
      }
      case "moveObject":
      case "rotateObject":
      case "removeObject": {
        const object = objectRecord(analysisContext(this.map), c.id);
        if (c.op === "removeObject") {
          if (object.kind === "trafficLight") throw new Error("Generated signals are controlled by modifyIntersection.signalized; cannot delete one generated mesh");
          this.execute({ op: object.kind === "sign" ? "deleteSign" : "deleteObject", id: c.id });
          break;
        }
        const position = c.op === "moveObject" ? { x: object.position.x + c.delta.x, y: (object.position.y ?? 0) + (c.delta.y ?? 0), z: object.position.z + c.delta.z } : object.position;
        const rotation = c.op === "rotateObject" ? c.rotation : object.rotation;
        if (![position.x, position.y ?? 0, position.z, rotation].every(Number.isFinite)) throw new Error("Object transform must be finite");
        if (object.kind === "trafficLight") this.execute({ op: "setSignalPlacement", intersectionId: object.intersectionId, approach: object.approach, position, heading: rotation });
        else if (object.kind === "sign") this.execute({ op: "modifySign", id: c.id, properties: { position, heading: rotation } });
        else this.execute({ op: "modifyObject", id: c.id, properties: { position, rotation } });
        break;
      }
      default:
        throw new Error(`Unknown editor operation: ${c.op}`);
    }
  }
  finish() {
    invalidateAnalysis(this.map);
    for (const j of this.map.intersections) if (this.changed.has(j.id) || j.connections.some((c) => this.changed.has(c.roadId))) {
      const w = this.junction(j.id);
      for (const e of w.connections) this.road(e.roadId);
      const local = { ...this.map, roads: this.map.roads.filter((r) => w.connections.some((c) => c.roadId === r.id)), intersections: [w], connectionPorts: [] };
      syncConnections(local);
      setJunctionPavementFootprint(w, this.map);
    }
    refreshPortPoses(this.map);
    const shape = (r) => JSON.stringify([r.centerline, r.curve, r.elevation, r.elevationMode]);
    const geometryChanged = new Set(this.map.roads.filter((r) => this.changed.has(r.id) && (!this.before.roads.some((old) => old.id === r.id) || shape(r) !== shape(this.before.roads.find((old) => old.id === r.id)))).map((r) => r.id));
    this.map.signs = this.map.signs.map((sign) => {
      if (!geometryChanged.has(sign.roadId)) return sign;
      const oldSign = this.before.signs?.find((s) => s.id === sign.id);
      if (!oldSign) return sign;
      const before = this.before.roads.find((r) => r.id === oldSign.roadId), after = this.map.roads.find((r) => r.id === sign.roadId);
      if (!before || !after) return sign;
      const previous = project(roadPoints(before), oldSign.position), pts = roadPoints(after), station = Math.min(sign.stationMetres ?? previous.along, polylineLength(pts)), next = sampleAt(pts, station);
      const offset = (oldSign.position.x - previous.point.x) * -previous.tangent.z + (oldSign.position.z - previous.point.z) * previous.tangent.x;
      const angle = Math.atan2(next.tangent.x, next.tangent.z) - Math.atan2(previous.tangent.x, previous.tangent.z);
      this.changed.add(sign.id);
      return { ...structuredClone(sign), stationMetres: station, position: { x: next.point.x - next.tangent.z * offset, y: next.point.y, z: next.point.z + next.tangent.x * offset }, heading: oldSign.heading + angle };
    });
    for (const r of this.map.roads) if (this.changed.has(r.id)) {
      const b = areaOf(r);
      this.map.bounds = { minX: Math.min(this.map.bounds.minX, b.minX), maxX: Math.max(this.map.bounds.maxX, b.maxX), minZ: Math.min(this.map.bounds.minZ, b.minZ), maxZ: Math.max(this.map.bounds.maxZ, b.maxZ) };
    }
    this.map.version = this.before.version + 1;
    invalidateAnalysis(this.map);
  }
};
var CityEditingKernel = class {
  constructor(map, history = new CityEditorHistory()) {
    this.map = map;
    this.history = history;
    this.map = adoptEditorMetadata(map);
    this.reindex();
  }
  map;
  history;
  index = new EditorSpatialIndex();
  byId = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  sequence = 0;
  revision = 0;
  /** Borrowed immutable snapshot. Write through commands only. */
  get data() {
    return this.map;
  }
  inspectProfile(id, step) {
    return inspectProfile(analysisContext(this.map), id, step);
  }
  inspectGeometry(id) {
    return inspectHorizontal(analysisContext(this.map), id);
  }
  inspectRamp(id) {
    return inspectRamp(analysisContext(this.map), id);
  }
  accessWindows(query) {
    return accessWindows(analysisContext(this.map), query);
  }
  inspectObject(id) {
    return inspectObject(analysisContext(this.map), id);
  }
  queryObjects(scope) {
    return queryObjects(analysisContext(this.map), scope);
  }
  inspectStructure(id) {
    return inspectStructure(analysisContext(this.map), id);
  }
  planBrush(request) {
    return planBrush(analysisContext(this.map), request);
  }
  diagnoseEngineering(scope, domain = "all") {
    return diagnoseEngineering(analysisContext(this.map), scope, domain);
  }
  inspectRegion(scope) {
    const context = analysisContext(this.map), roads = context.selectedRoads(scope);
    return { roads: roads.slice(0, scope.limit ?? 100).map((r) => this.briefRoad(r)), intersections: this.map.intersections.filter((j) => j.connections.some((c) => roads.some((r) => r.id === c.roadId))), ramps: roads.filter((r) => roadFunction(r) === "ramp").map((r) => ({ roadId: r.id })), objects: this.queryObjects(scope), structures: roads.filter((r) => r.structure || r.elevationMode === "elevated").map((r) => ({ roadId: r.id, structure: r.structure ?? null })), diagnostics: this.diagnoseEngineering(scope) };
  }
  inspectIssue(id, scope) {
    const report = this.diagnoseEngineering({ ...scope, limit: 1e6 });
    const found = report.issues.find((i) => i.id === id) ?? this.diagnose({ ...scope, limit: 1e6 }, { retainAllIssues: true }).issues.find((i) => i.id === id);
    if (!found) throw new Error("Issue not found in scope");
    return { issue: found, object: found.objectId ? this.inspectObject(found.objectId) : null, geometry: found.roadId ? this.inspectGeometry(found.roadId) : null, nearby: found.roadId ? this.inspectArea({ id: found.roadId, limit: 10 }) : null, suggestedRepair: found.repair ?? null };
  }
  previewSnapshot(id) {
    const p = this.pending.get(id);
    if (!p) throw new Error("Preview expired");
    return p.transaction.map;
  }
  reviewPreview(id, full = false) {
    return reviewMaps(this.map, this.previewSnapshot(id), { full });
  }
  diffPreview(id) {
    return semanticDiff(this.map, this.previewSnapshot(id));
  }
  reindex() {
    this.index = new EditorSpatialIndex();
    this.byId.clear();
    for (const e of [...this.map.roads, ...this.map.intersections, ...this.map.objects]) {
      this.byId.set(e.id, e);
      this.index.set(e.id, areaOf(e));
    }
  }
  restore(map) {
    const next = new Map([...map.roads, ...map.intersections, ...map.objects].map((e) => [e.id, e]));
    for (const [id, e] of this.byId) if (!next.has(id) || next.get(id) !== e) this.index.delete(id);
    for (const [id, e] of next) if (this.byId.get(id) !== e) this.index.set(id, areaOf(e));
    this.byId = next;
    this.map = map;
    this.revision++;
    this.pending.clear();
  }
  getRoad(id) {
    const e = this.byId.get(id);
    return e && "centerline" in e ? structuredClone(e) : void 0;
  }
  getControlPoints(id) {
    const r = this.getRoad(id);
    if (!r) throw new Error("Missing road");
    return structuredClone(editing(this.map).curves?.[id] ?? r.centerline);
  }
  getCorridor(id) {
    const c = editing(this.map).corridors.find((c2) => c2.id === id);
    return c ? structuredClone(c) : void 0;
  }
  listCorridors(name = "") {
    return editing(this.map).corridors.filter((c) => !name || c.name.includes(name) || c.id.includes(name)).map((c) => ({ id: c.id, name: c.name, roadCount: c.roadIds.length }));
  }
  getGroup(id) {
    const g = editing(this.map).groups.find((g2) => g2.id === id);
    return g ? structuredClone(g) : void 0;
  }
  getIntersection(id) {
    const e = this.byId.get(id);
    return e && "connections" in e ? structuredClone(e) : void 0;
  }
  getSign(id) {
    const sign = this.map.signs?.find((s) => s.id === id);
    return sign ? structuredClone(sign) : void 0;
  }
  findSigns(query = {}) {
    return structuredClone((this.map.signs ?? []).filter((s) => (!query.roadId || s.roadId === query.roadId) && (!query.type || s.type === query.type) && (!query.center || distance(s.position, query.center) <= (query.radius ?? 100)) && (!query.bbox || overlaps(bounds([s.position]), query.bbox))).slice(0, query.limit ?? 50));
  }
  getConnectedRoads(id) {
    return this.connected(this.map, id);
  }
  connected(map, id) {
    const ids = /* @__PURE__ */ new Set();
    for (const l of map.roadLinks ?? []) {
      if (l.from.roadId === id) ids.add(l.to.roadId);
      if (l.to.roadId === id) ids.add(l.from.roadId);
    }
    for (const j of map.intersections) if (j.connections.some((c) => c.roadId === id)) {
      for (const c of j.connections) if (c.roadId !== id) ids.add(c.roadId);
    }
    return [...ids];
  }
  findRoads(query = {}) {
    const area = query.bbox ?? (query.center ? bounds([query.center], query.radius ?? 100) : void 0);
    const candidates = area ? this.index.query(area).map((id) => this.byId.get(id)).filter((e) => !!e && "centerline" in e) : this.map.roads;
    const corridor = query.corridor ? this.getCorridor(query.corridor) : void 0, connected = query.connectedTo ? new Set(this.getConnectedRoads(query.connectedTo)) : void 0;
    return candidates.filter((r) => (!query.id || r.id === query.id) && (!query.roadClass || roadFunction(r) === query.roadClass) && (!query.corridor || !!corridor?.roadIds.includes(r.id)) && (!query.district || r.district === query.district) && (!query.group || r.groupId === query.group || editing(this.map).groups.some((g) => g.id === query.group && g.memberIds.includes(r.id))) && (!query.roadNameId || r.roadNameId === query.roadNameId) && (!query.name || (r.displayName ?? this.map.roadNames?.[r.roadNameId ?? ""]?.primaryText ?? "").includes(query.name)) && (!query.section || r.corridorSection === query.section) && (!query.presetSource || r.presetSource === query.presetSource) && (!connected || connected.has(r.id)) && (!query.center || project(roadPoints(r), query.center).distance <= (query.radius ?? 100))).slice(0, query.limit ?? 100).map((r) => this.briefRoad(r));
  }
  getNearbyRoads(center, radius = 100) {
    return this.findRoads({ center, radius });
  }
  briefRoad(r) {
    const pts = roadPoints(r);
    return { id: r.id, name: r.displayName ?? this.map.roadNames?.[r.roadNameId ?? ""]?.primaryText, roadNameId: r.roadNameId, groupId: r.groupId, section: r.corridorSection, presetSource: r.presetSource, roadClass: roadFunction(r), lanes: r.laneCount, length: Math.round(polylineLength(pts) * 10) / 10, elevation: [Math.min(...pts.map((p) => p.y ?? 0)), Math.max(...pts.map((p) => p.y ?? 0))], bounds: bounds(pts), corridors: editing(this.map).corridors.filter((c) => c.roadIds.includes(r.id)).map((c) => c.id) };
  }
  inspectArea(query) {
    if (!query.bbox && !query.center && !query.corridor && !query.id && !query.group && !query.roadNameId && !query.name) throw new Error("inspectArea requires bbox, center/radius, corridor, group, name or road ID");
    const roads = this.findRoads(query), ids = new Set(roads.map((r) => r.id));
    const intersections = this.map.intersections.filter((j) => j.connections.some((c) => ids.has(c.roadId)) || !!query.bbox && overlaps(bounds([j.position]), query.bbox));
    return structuredClone({ revision: this.revision, roads, corridors: editing(this.map).corridors.filter((c) => c.roadIds.some((id) => ids.has(id))).map((c) => ({ id: c.id, name: c.name, roadCount: c.roadIds.length, localRoadIds: c.roadIds.filter((id) => ids.has(id)) })), groups: editing(this.map).groups.filter((g) => g.memberIds.some((id) => ids.has(id))).map((g) => ({ id: g.id, name: g.name, kind: g.kind, locked: g.locked, memberCount: g.memberIds.length })), intersections: intersections.map((j) => ({ id: j.id, position: j.position, signalized: j.signalized, arms: j.connections })), ramps: editing(this.map).ramps.filter((r) => ids.has(r.roadId)), structures: roads.flatMap((r) => {
      const road = this.map.roads.find((o) => o.id === r.id);
      return road.structure ? [{ roadId: r.id, ...road.structure }] : [];
    }), signs: (this.map.signs ?? []).filter((s) => ids.has(s.roadId)).slice(0, 30).map((s) => ({ id: s.id, roadId: s.roadId, type: s.type, template: s.template, position: s.position, destinations: s.destinations })), connectivity: roads.map((r) => ({ id: r.id, connected: this.getConnectedRoads(r.id) })), warnings: this.validateIds(this.map, ids).slice(0, 50), truncated: roads.length === (query.limit ?? 100) });
  }
  preview(commands, label = "Edit map") {
    this.pending.clear();
    const transaction = new EditTransaction(this.map, this.index);
    for (const command of Array.isArray(commands) ? commands : [commands]) transaction.execute(command);
    transaction.finish();
    const after = transaction.map, old = new Map([...this.map.roads, ...this.map.intersections, ...this.map.objects, ...this.map.signs ?? [], ...editing(this.map).corridors, ...editing(this.map).groups].map((e) => [e.id, e]));
    const fresh = new Map([...after.roads, ...after.intersections, ...after.objects, ...after.signs ?? [], ...editing(after).corridors, ...editing(after).groups].map((e) => [e.id, e]));
    const created = [...fresh.keys()].filter((id) => !old.has(id)), deleted = [...old.keys()].filter((id) => !fresh.has(id));
    const modified = [...transaction.changed].filter((id) => old.has(id) && fresh.has(id));
    const areas = [.../* @__PURE__ */ new Set([...created, ...deleted, ...modified])].flatMap((id) => [this.byId.get(id), after.roads.find((r) => r.id === id), after.intersections.find((j) => j.id === id), after.objects.find((o) => o.id === id), this.map.signs?.find((s) => s.id === id), after.signs?.find((s) => s.id === id)].filter((e) => !!e).map((e) => "position" in e ? bounds([e.position], 40) : areaOf(e)));
    const ids = /* @__PURE__ */ new Set([...transaction.changed, ...created]);
    const warnings = [...transaction.notes, ...this.validateIds(after, ids)];
    const summary = { id: `preview-${++this.sequence}`, revision: this.revision, label, created, modified, deleted, area: union(areas), warnings, valid: !warnings.some((w) => w.severity === "error"), ...Object.keys(transaction.metrics).length ? { metrics: transaction.metrics } : {} };
    this.pending.clear();
    this.pending.set(summary.id, { transaction, summary });
    return structuredClone(summary);
  }
  dryRun(commands, label) {
    return this.preview(commands, label);
  }
  previewData(id) {
    const p = this.pending.get(id);
    if (!p) throw new Error("Preview expired");
    const ids = /* @__PURE__ */ new Set([...p.summary.created, ...p.summary.modified, ...p.summary.deleted]);
    return structuredClone({
      roads: p.transaction.map.roads.filter((r) => ids.has(r.id)),
      intersections: p.transaction.map.intersections.filter((j) => ids.has(j.id)),
      objects: p.transaction.map.objects.filter((o) => ids.has(o.id)),
      signs: (p.transaction.map.signs ?? []).filter((s) => ids.has(s.id)),
      beforeRoads: this.map.roads.filter((r) => ids.has(r.id)),
      beforeIntersections: this.map.intersections.filter((j) => ids.has(j.id))
    });
  }
  commit(id) {
    const p = this.pending.get(id);
    if (!p || p.summary.revision !== this.revision) throw new Error("Preview is stale; preview again");
    if (!p.summary.valid) throw new Error(p.summary.warnings.filter((w) => w.severity === "error").map((w) => w.message).join("\n"));
    this.history.recordTransaction(this.map, p.transaction.map, p.summary.label);
    this.map = p.transaction.map;
    this.revision++;
    for (const id2 of [...p.summary.deleted, ...p.summary.modified, ...p.summary.created]) {
      this.byId.delete(id2);
      this.index.delete(id2);
      const e = [...this.map.roads, ...this.map.intersections, ...this.map.objects].find((e2) => e2.id === id2);
      if (e) {
        this.byId.set(id2, e);
        this.index.set(id2, areaOf(e));
      }
    }
    this.pending.clear();
    return structuredClone(p.summary);
  }
  cancelPreview() {
    this.pending.clear();
  }
  apply(commands, label) {
    const p = this.preview(commands, label);
    return this.commit(p.id);
  }
  undo() {
    const previous = this.history.undo(this.map);
    if (!previous) return false;
    this.restore(previous);
    return true;
  }
  redo() {
    const next = this.history.redo(this.map);
    if (!next) return false;
    this.restore(next);
    return true;
  }
  validateRoad(id) {
    return this.getRoad(id) ? this.validateIds(this.map, /* @__PURE__ */ new Set([id])) : [{ severity: "error", code: "road.missing", ids: [id], message: "Missing road" }];
  }
  validateSelection(id) {
    const group = this.getGroup(id), corridor = this.getCorridor(id), j = this.getIntersection(id), sign = this.getSign(id);
    return this.validateIds(this.map, new Set(group ? group.memberIds : corridor ? corridor.roadIds : j ? [id, ...j.connections.map((c) => c.roadId)] : sign ? [sign.id, sign.roadId] : [id]));
  }
  validateCorridor(id) {
    const c = this.getCorridor(id);
    return c ? this.validateIds(this.map, new Set(c.roadIds)) : [{ severity: "error", code: "corridor.missing", ids: [id], message: "Missing corridor" }];
  }
  validateIntersection(id) {
    const j = this.getIntersection(id);
    return this.validateIds(this.map, /* @__PURE__ */ new Set([id, ...j?.connections.map((c) => c.roadId) ?? []]));
  }
  validateArea(area) {
    return this.validateIds(this.map, new Set(this.index.query(area)));
  }
  /** Quality diagnostics; distinct from structural validation. */
  diagnose(scope = {}, options = {}) {
    const report = diagnoseMap(this.map, scope, { index: this.index, revision: this.revision, retainAllIssues: true }), context = analysisContext(this.map);
    const rank = { info: 0, warning: 1, error: 2 };
    const additions = context.selectedRoads(scope).flatMap((r) => profileIssues(context, r.id)).filter((i) => (!scope.codes?.length || scope.codes.some((c) => i.code.startsWith(c))) && rank[i.severity] >= rank[scope.minSeverity ?? "info"]);
    report.issues.push(...additions);
    for (const diagnostic of report.issues) diagnostic.id ??= [diagnostic.code, diagnostic.roadId ?? "", diagnostic.intersectionId ?? "", diagnostic.station?.toFixed(2) ?? "", diagnostic.metrics?.otherRoadId ?? "", diagnostic.metrics?.port ?? ""].join(":");
    const byCode = {};
    for (const i of report.issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;
    const error = report.issues.filter((i) => i.severity === "error").length, warning = report.issues.filter((i) => i.severity === "warning").length, info = report.issues.filter((i) => i.severity === "info").length;
    report.counts = { total: report.issues.length, error, warning, info, bySeverity: { error, warning, info }, byCode };
    return options.retainAllIssues ? report : pageDiagnosticReport(report, { limit: scope.limit });
  }
  /** Explicit full-map schema validation. Never called implicitly by an edit. */
  validateFull() {
    const report = validateMap(this.map);
    return [...report.errors, ...report.warnings].map((issue2) => ({ severity: issue2.severity, code: issue2.code, ids: [], message: `${issue2.path}: ${issue2.message}` }));
  }
  validateIds(map, ids) {
    const context = analysisContext(map), expanded = new Set(ids);
    for (const object of [...map.objects, ...map.signs ?? []]) if (ids.has(object.id)) for (const key of context.spatial.query(bounds([object.position], 50))) {
      if (key.startsWith("road:")) expanded.add(key.slice(5));
      if (key.startsWith("junction:")) expanded.add(key.slice(9));
    }
    for (const ramp of map.editing?.ramps ?? []) if (ids.has(ramp.roadId)) {
      expanded.add(ramp.from.roadId);
      expanded.add(ramp.to.roadId);
      for (const hit of context.crossings(ramp.roadId)) expanded.add(hit.roadId);
    }
    ids = expanded;
    const result = [], add = (severity, code, objects, message) => result.push({ severity, code, ids: objects, message });
    const selected = map.roads.filter((r) => ids.has(r.id));
    const js = map.intersections.filter((j) => ids.has(j.id) || j.connections.some((c) => ids.has(c.roadId)));
    const closure = /* @__PURE__ */ new Set([...ids, ...js.flatMap((j) => j.connections.map((c) => c.roadId))]);
    for (const l of map.roadLinks ?? []) if (ids.has(l.from.roadId) || ids.has(l.to.roadId)) {
      closure.add(l.from.roadId);
      closure.add(l.to.roadId);
    }
    const signs = (map.signs ?? []).filter((s) => ids.has(s.id) || ids.has(s.roadId));
    for (const s of signs) {
      closure.add(s.roadId);
      if (s.incomingRoadId) closure.add(s.incomingRoadId);
      for (const id of s.outgoingRoadIds ?? []) closure.add(id);
    }
    const fragment = { ...newCityMap(), id: map.id, name: map.name, version: map.version, sectorSize: map.sectorSize, bounds: map.bounds, environment: { districts: map.environment.districts, spawnPoints: map.environment.spawnPoints }, roadNames: map.roadNames, signs, roads: map.roads.filter((r) => closure.has(r.id)), intersections: js, objects: map.objects.filter((o) => ids.has(o.id)), roadLinks: (map.roadLinks ?? []).filter((l) => ids.has(l.from.roadId) || ids.has(l.to.roadId)), connectionPorts: (map.connectionPorts ?? []).filter((p) => ids.has(p.endpoint.roadId)) };
    const report = validateMap(fragment);
    for (const issue2 of [...report.errors, ...report.warnings]) add(issue2.severity, issue2.code, [...ids], `${issue2.path}: ${issue2.message}`);
    for (const route of map.regional?.highways?.routes ?? []) for (const id of route.roadIds) if (ids.has(id) && map.roads.find((r) => r.id === id)?.roadNameId !== route.id) add("error", "highway.ownership", [id], `Road must retain route registry ${route.id}; rename its existing name entry instead`);
    for (const r of selected) {
      const pts = roadPoints(r), length = polylineLength(pts), grade = maxGrade(r);
      if (length < 3) add("warning", "tiny.fragment", [r.id], "Road shorter than 3m");
      if (grade > 0.12) add(grade > 0.25 ? "error" : "warning", "extreme.grade", [r.id], `Maximum grade ${(grade * 100).toFixed(1)}%`);
      if (!this.connected(map, r.id).length) add("warning", "disconnected.road", [r.id], "No explicit road or intersection connections");
      const nearbyIds = /* @__PURE__ */ new Set([...this.index.query(bounds(pts, 30)), ...ids]);
      for (const other of map.roads) if (other.id !== r.id && nearbyIds.has(other.id)) {
        if (selected.some((s) => s.id === other.id) && other.id < r.id) continue;
        for (const c of crossings(pts, roadPoints(other))) {
          const gap = Math.abs((c.point.y ?? 0) - c.otherY);
          if (gap < 0.5 && !this.connected(map, r.id).includes(other.id) && !js.some((j) => distance(j.position, c.point) < 40)) add("warning", roadFunction(r) === "expressway" || roadFunction(other) === "expressway" ? "expressway.unconnected-crossing" : "unconnected.crossing", [r.id, other.id], "Same-level crossing has no junction; verify the chosen no-connection intent");
          else if (gap >= 0.5 && gap < 5.5) add("warning", "structure.clearance", [r.id, other.id], `Crossing clearance ${gap.toFixed(1)}m is below 5.5m`);
        }
      }
    }
    for (const j of js) for (const other of js) if (j.id < other.id && distance(j.position, other.position) < 8 && Math.abs((j.position.y ?? 0) - (other.position.y ?? 0)) < 0.5) add("warning", "duplicate.intersection", [j.id, other.id], "Adjacent junction centers may be one divided-road intersection");
    for (const object of [...map.objects, ...map.signs ?? []]) if (ids.has(object.id)) {
      const record = objectRecord(context, object.id);
      for (const diagnostic of placementIssues(context, record)) if (diagnostic.severity !== "info") add(diagnostic.severity, diagnostic.code, [object.id, ...diagnostic.roadId ? [diagnostic.roadId] : []], diagnostic.message);
    }
    return result;
  }
};

// artifacts/batch23/reachability.ts
function preserveReachability(before, after) {
  const graph = (map) => {
    const network = buildCityRoadNetwork(map), nodes = /* @__PURE__ */ new Map(), laneNode = /* @__PURE__ */ new Map();
    for (const r of network.segments) for (const lane of r.lanes) {
      const key = r.id + "|" + lane.direction;
      nodes.set(key, nodes.get(key) ?? /* @__PURE__ */ new Set());
      laneNode.set(lane.id, key);
    }
    for (const link of network.laneConnections) {
      const a2 = laneNode.get(link.fromLaneId), b2 = laneNode.get(link.toLaneId);
      if (a2 && b2) nodes.get(a2).add(b2);
    }
    return nodes;
  };
  const a = graph(before), b = graph(after), oldIds = before.roads.map((r) => r.id).sort((a2, b2) => b2.length - a2.length), lineage = /* @__PURE__ */ new Map();
  for (const id of b.keys()) {
    const cut = id.lastIndexOf("|"), road = id.slice(0, cut), direction = id.slice(cut);
    const original = oldIds.find((old) => road === old || road.startsWith(old + "-section"));
    if (original) {
      const key = original + direction, list = lineage.get(key) ?? [];
      list.push(id);
      lineage.set(key, list);
    }
  }
  const reached = (graph2, seeds) => {
    const seen = /* @__PURE__ */ new Set(), queue = [...seeds];
    while (queue.length) {
      const n = queue.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      for (const to of graph2.get(n) ?? []) if (!seen.has(to)) queue.push(to);
    }
    return seen;
  };
  const losses = [];
  let pairs = 0;
  for (const from of a.keys()) {
    const old = reached(a, [from]), next = reached(b, lineage.get(from) ?? []);
    for (const to of old) {
      pairs++;
      if (!(lineage.get(to) ?? []).some((id) => next.has(id))) losses.push({ from, to });
    }
  }
  return { sources: a.size, verifiedPairs: pairs, losses };
}

// src/world/regional/FastRoadSignPlacement.ts
var isFastRoad = isControlledAccessRoad;
var isSafetySign = (sign) => sign.type === "SPEED_LIMIT" || sign.type === "CHEVRON";
var readingGap = (a, b, roads) => Math.max(45, Math.min(120, Math.max(roads.get(a.roadId).speedLimit, roads.get(b.roadId).speedLimit) * 0.9));
function signReadingConflict(a, b, gap = 90) {
  if (Math.cos(a.heading - b.heading) < 0.9) return false;
  const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
  const heading = Math.atan2(Math.sin(a.heading) + Math.sin(b.heading), Math.cos(a.heading) + Math.cos(b.heading));
  if (Math.abs(-dx * Math.sin(heading) - dz * Math.cos(heading)) >= gap) return false;
  const da = signDimensions(a.template, a.size, a.postOffset, a.gantryPosts, a.mountHeight);
  const db = signDimensions(b.template, b.size, b.postOffset, b.gantryPosts, b.mountHeight);
  if (Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading)) >= (da.width + db.width) / 2 + 0.8) return false;
  const ya = (a.position.y ?? 0) + da.bottom, yb = (b.position.y ?? 0) + db.bottom;
  return ya < yb + db.height + 0.3 && yb < ya + da.height + 0.3;
}
function auditFastRoadSigns(map) {
  const roads = new Map(map.roads.map((r) => [r.id, r]));
  const navigation = (map.signs ?? []).filter((s) => isFastRoad(roads.get(s.roadId)) && !isSafetySign(s));
  const conflicts = [];
  for (let i = 0; i < navigation.length; i++) for (let j = i + 1; j < navigation.length; j++)
    if (signReadingConflict(navigation[i], navigation[j], readingGap(navigation[i], navigation[j], roads))) conflicts.push({ a: navigation[i].id, b: navigation[j].id });
  return {
    navigation: navigation.length,
    speedLimits: map.signs?.filter((s) => s.type === "SPEED_LIMIT").length ?? 0,
    chevrons: map.signs?.filter((s) => s.type === "CHEVRON").length ?? 0,
    conflicts
  };
}

// artifacts/batch23/engineering.ts
var source = "src/world/regional/regional-main.json";
var dir = "artifacts/batch23";
var save = (name, data) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2));
var k = new CityEditingKernel(JSON.parse(readFileSync(source, "utf8")));
var mode = process.argv[2];
function tx(name, operations, inspection) {
  if (!operations.length) return;
  const summary = k.preview(operations, name);
  save(name + "-preview", { inspection, operations, summary });
  if (!summary.valid) throw new Error(name + ": " + JSON.stringify(summary.warnings.filter((i) => i.severity === "error")));
  const diff = k.diffPreview(summary.id);
  save(name + "-diff", diff);
  if (diff.topology.changed) {
    const reachability = preserveReachability(k.data, k.previewSnapshot(summary.id));
    save(name + "-reachability", reachability);
    if (reachability.losses.length) throw new Error(name + ": directed route regression " + JSON.stringify(reachability.losses.slice(0, 5)));
  } else if (diff.topology.componentDelta > 0 || diff.topology.newDeadEnds.length || diff.topology.laneConnectionsRemoved.length) throw new Error(name + ": topology regression");
  const validation = validateMap(k.previewSnapshot(summary.id));
  save(name + "-validation", validation);
  if (!validation.valid) throw new Error(name + ": invalid map");
  if (diff.roads.modified.length || diff.roads.added.length) {
    const scope = { bbox: diff.affectedBbox, limit: 1e6 };
    save(name + "-local-diagnose", { before: diagnoseMap(k.data, scope, { retainAllIssues: true }), after: diagnoseMap(k.previewSnapshot(summary.id), scope, { retainAllIssues: true }) });
  }
  k.commit(summary.id);
  writeFileSync(source + ".batch23-tmp", JSON.stringify(k.data) + "\n");
  renameSync(source + ".batch23-tmp", source);
  console.log(name, JSON.stringify({ modified: summary.modified.length, created: summary.created.length, deleted: summary.deleted.length, errors: validation.errorCount, warning: validation.warningCount }));
  k = new CityEditingKernel(k.data);
}
if (mode === "access") {
  const specifications = [
    ["v91-ew-east-eb-off", 1285, void 0],
    ["v91-ew-east-wb-on", void 0, 1285],
    ["v91-ew-west-eb-off", -1620, void 0],
    ["v91-ew-west-wb-on", void 0, -1620],
    ["access-ew-west-eb-on", void 0, -650],
    ["access-ew-west-wb-off", -650, void 0],
    ["v91-ew-east-eb-on", void 0, 1875],
    ["v91-ew-east-wb-off", 1875, void 0],
    ["access-ns-north-sb-off", -1760, void 0],
    ["access-ns-north-nb-on", void 0, -1760],
    ["access-ns-north-sb-on", -1320, -1150],
    ["access-ns-north-nb-off", -1150, -1320],
    ["v91-ns-sb-on", void 0, 1560],
    ["v91-ns-nb-off", 1560, void 0],
    ["v91-ns-sb-off", 600, 730],
    ["v91-ns-nb-on", 730, 600]
  ];
  for (const [id, fromAxis, toAxis] of specifications) {
    const c = analysisContext(k.data), meta = k.data.editing.ramps.find((m) => m.roadId === id), r = c.road(id), ns = id.includes("-ns-"), axis = ns ? "z" : "x";
    const locate = (ref, value) => {
      if (value === void 0) return void 0;
      const old = c.road(ref.roadId), path = c.path(old.id), p = path[ref.end === "start" ? 0 : path.length - 1], target = { ...p, [axis]: value };
      const candidates = c.nearRoads(target, 120).filter((h) => roadFunction(h.road) === roadFunction(old) && h.road.roadNameId === old.roadNameId && h.road.travelDirection === old.travelDirection && !h.road.highwayTransition);
      if (!candidates.length) throw new Error("No attachment road " + id);
      return { roadId: candidates[0].road.id, station: candidates[0].along };
    };
    const from = locate(meta.from, fromAxis), to = locate(meta.to, toAxis), before = k.inspectRamp(id);
    save("window-" + id, k.accessWindows({ mainline: roadFunction(c.road(meta.from.roadId)) === "expressway" ? meta.from.roadId : meta.to.roadId, frontage: roadFunction(c.road(meta.from.roadId)) === "frontage" ? meta.from.roadId : meta.to.roadId, minLength: 30, buffer: 60 }));
    const ops = [{ op: "modifyRamp", id, from, to }, { op: "modifyRoad", id, properties: { speedLimit: 40, streetlights: false, structure: { ...r.structure, piersEnabled: !ns, enclosure: ns ? { kind: "cutting", clearance: 6 } : void 0 } } }];
    tx("access-" + id, ops, { before, from, to });
  }
}
if (mode === "profiles") {
  const c = analysisContext(k.data), regions = /* @__PURE__ */ new Map(), audit = [];
  for (const r of k.data.roads.filter((r2) => roadFunction(r2) === "ramp")) {
    const p = inspectProfile(c, r.id);
    audit.push({ id: r.id, metrics: p.metrics, extrema: p.extrema, constraints: p.constraints });
    if (!p.extrema.length) continue;
    let result;
    try {
      result = repairConstrainedProfile(c, r.id, { strategy: "fitBetweenConstraints" });
    } catch (error) {
      console.log("profile retained", r.id, String(error));
      continue;
    }
    const before = p.metrics, after = result.metrics.after;
    if (after.extremaCount >= before.extremaCount || after.maxGrade > before.maxGrade + 1e-6) continue;
    const center = sampleAt(c.path(r.id), p.length / 2).point;
    const region = r.id.startsWith("regional:") ? "regional" : center.z < -600 ? "north" : center.z > 1e3 ? "south" : center.x < -800 ? "west" : center.x > 800 ? "east" : "central";
    const g = regions.get(region) ?? { ops: [], review: [] };
    g.ops.push({ op: "repairRamp", id: r.id, strategy: "fitBetweenConstraints" });
    g.review.push({ id: r.id, before, after, constraints: p.constraints });
    regions.set(region, g);
  }
  save("all-ramp-profile-audit", audit);
  for (const [region, g] of regions) tx("profile-" + region, g.ops, g.review);
}
if (mode === "detail") {
  const c = analysisContext(k.data), ids = k.data.roads.filter((r) => r.roadNameId === "direction-mingyuan" || k.data.roadNames?.[r.roadNameId ?? ""]?.primaryText === "\u660E\u8FDC\u5FEB\u901F\u8DEF").map((r) => r.id);
  const endRoads = [k.data.roads.find((r) => r.id === "direction-mingyuan-main"), k.data.roads.find((r) => r.id === "direction-mingyuan-main-section-section-section-section")];
  save("mingyuan-end-detail", endRoads.map((r, i) => {
    const p = c.path(r.id), e = p[i === 0 ? 0 : p.length - 1];
    return { road: r, profile: inspectProfile(c, r.id), nearRoads: c.nearRoads(e, 150).map((h) => ({ id: h.road.id, name: k.data.roadNames?.[h.road.roadNameId ?? ""]?.primaryText, lanes: h.road.laneCount, points: h.road.centerline, distance: h.distance })), junctions: k.data.intersections.filter((j) => j.connections.some((a) => a.roadId === r.id)) };
  }));
  const access = k.data.editing.ramps.filter((m) => /^(v91-ew|v91-ns|access-ew|access-ns)/.test(m.roadId));
  save("access-review", access.map((m) => {
    const r = c.road(m.roadId), p = c.path(r.id);
    return { id: r.id, metadata: m, points: r.centerline, length: polylineLength(p), inspection: k.inspectRamp(r.id), ends: [m.from, m.to].map((e) => ({ endpoint: e, road: c.road(e.roadId), connected: k.getConnectedRoads(e.roadId) })) };
  }));
  console.log("details saved", ids.length, access.length);
}
if (mode === "mingyuan") {
  for (const [id, end, junction] of [["direction-mingyuan-main", "start", "urban-junction-56"], ["direction-mingyuan-main-section-section-section-section", "end", "direction-mingyuan-ne-terminal"]]) {
    if (end === "start" && k.data.roads.find((r) => r.id === id)?.roadClass === "arterial") continue;
    const p = roadPoints(k.data.roads.find((r) => r.id === id)), length = polylineLength(p), start = end === "start" ? 0 : length - 180, finish = end === "start" ? 180 : length;
    tx("mingyuan-" + end + "-alignment", [{ op: "smoothRoad", id, start, end: finish, strength: 1.4, tolerance: 0.15 }, { op: "repairElevation", id, start, end: finish, strategy: "smoothGradeBreak" }, { op: "repairIntersection", id: junction }], { geometry: k.inspectGeometry(id), profile: k.inspectProfile(id) });
    const path = roadPoints(k.data.roads.find((r) => r.id === id)), cut = end === "start" ? 180 : polylineLength(path) - 180;
    const preview = k.preview({ op: "splitRoad", roadId: id, point: sampleAt(path, cut).point });
    const added = k.previewSnapshot(preview.id).roads.find((r) => !k.data.roads.some((old) => old.id === r.id)).id;
    k.cancelPreview();
    const terminal = end === "start" ? id : added;
    tx("mingyuan-" + end + "-transition", [{ op: "splitRoad", roadId: id, point: sampleAt(path, cut).point }, { op: "modifyRoad", id: terminal, properties: { roadClass: "arterial", speedLimit: 40, structure: { barrierEnabled: false, piersEnabled: false }, streetlights: false, markings: true } }, { op: "repairIntersection", id: junction }], { terminal, reason: "180m terminal approach, six lanes retained; lane turns at junction absorb receiving-road width change" });
    const j = k.data.intersections.find((j2) => j2.id === junction), connection = j.connections.find((c) => c.roadId === terminal);
    const approaches = { ...j.approaches, [connection.port]: { lanes: end === "start" ? ["left", "straight", "straight-right"] : ["left", "left-right", "right"], arrowDistance: 35 } };
    tx("mingyuan-" + end + "-markings", [{ op: "modifyIntersection", id: junction, properties: { approaches } }], { servedRoad: terminal, lanes: approaches[connection.port] });
  }
}
if (mode === "tunnels") {
  const ops = [], inspection = [];
  for (const r of k.data.roads) {
    if (r.id.startsWith("ns-tunnel:") && r.structure?.enclosure?.kind === "cutting") {
      inspection.push(k.inspectStructure(r.id));
      ops.push({ op: "modifyRoad", id: r.id, properties: { corridorSection: "tunnel-mainline", streetlights: false, structure: { ...r.structure, enclosure: { kind: "tunnel", clearance: 6 }, piersEnabled: false, barrierEnabled: false } } });
    } else if (structureType(r) === "depressed" && !r.structure?.enclosure) {
      inspection.push(k.inspectStructure(r.id));
      ops.push({ op: "modifyRoad", id: r.id, properties: { structure: { ...r.structure, enclosure: { kind: "cutting", clearance: 6 }, piersEnabled: false } } });
    }
  }
  tx("tunnel-shells-and-open-cuts", ops, inspection);
}
if (mode === "objects" || mode === "signals") {
  const pass = process.argv[3] ?? "3";
  const c = analysisContext(k.data), terrain = regionalTerrainSampler(k.data), groups = /* @__PURE__ */ new Map();
  const solid = (type) => !["parking", "water", "waterway", "railway_track", "sports_field", "green_strip", "hardscape", "embankment"].includes(type);
  const meaningful = (issues, building = false) => issues.filter((i) => i.severity !== "info" && !["object.tooCloseToObject", "streetlight.tooDense", "roadSign.wrongSide"].includes(i.code) && (!building || i.code.startsWith("building.") || i.code === "object.intersectsRoadStructure"));
  for (const o of editableObjects(c)) {
    if (mode === "signals" && o.kind !== "trafficLight") continue;
    if (!solid(o.type) && !["green_strip", "hardscape"].includes(o.type)) continue;
    const anchor = deriveAnchor(c, o);
    if (!anchor) continue;
    const ground = terrain.heightAt(o.position.x, o.position.z), roadY = sampleAt(c.path(anchor.anchorRoadId), anchor.station).point.y ?? 0;
    const heightMode = o.kind === "prefab" && (o.type === "tree" || isBuilding(o.type) || Math.abs((o.position.y ?? 0) - ground) < Math.abs((o.position.y ?? 0) - roadY) + 0.1) ? "GROUND" : "ROAD_SURFACE";
    if (!meaningful(placementIssues(c, o, { heightMode }), isBuilding(o.type)).length) continue;
    const key = [Math.floor(o.position.x / 2e3), Math.floor(o.position.z / 2e3), o.type, heightMode].join(":");
    const ids = groups.get(key) ?? [];
    ids.push(o.id);
    groups.set(key, ids);
  }
  save("object-repair-selection", [...groups].map(([scope, ids]) => ({ scope, ids })));
  let index = 0;
  for (const [key, ids] of groups) {
    const context = analysisContext(k.data), records = editableObjects(context).filter((o) => ids.includes(o.id));
    if (!records.length) continue;
    const type = records[0].type, heightMode = key.endsWith("GROUND") ? "GROUND" : "ROAD_SURFACE", area = bounds(records.map((o) => o.position), 1);
    const request = { mode: "REPAIR", type, objectIds: ids, bbox: area, heightMode, heightOffset: 0, orientation: records[0].kind === "sign" || records[0].kind === "trafficLight" ? "FACE_TRAFFIC" : "ROAD_FORWARD", autoAdjust: "ADJUST", maxAutoMove: isBuilding(type) ? 60 : 35, limit: 5e3, minDistanceToObject: 0.6 };
    if (type === "trafficLight") request.intersectionId = records[0].intersectionId;
    const plan = k.planBrush(request);
    save("brush-pass" + pass + "-plan-" + index, plan);
    const ops = [...plan.operations], done = new Set(plan.candidates.filter((o) => o.state !== "INVALID").map((o) => o.id));
    const unresolved = [];
    const rectOverlap = (a, b) => {
      const ay = a.position.y ?? 0, by = b.position.y ?? 0;
      if (ay >= by + b.size.height || by >= ay + a.size.height) return false;
      const axes = (yaw) => [{ x: Math.cos(yaw), z: -Math.sin(yaw) }, { x: Math.sin(yaw), z: Math.cos(yaw) }], aa = axes(a.rotation), bb = axes(b.rotation);
      return [...aa, ...bb].every((axis) => {
        const radius = (o, axes2) => Math.abs(axis.x * axes2[0].x + axis.z * axes2[0].z) * o.size.width / 2 + Math.abs(axis.x * axes2[1].x + axis.z * axes2[1].z) * o.size.depth / 2;
        return Math.abs((a.position.x - b.position.x) * axis.x + (a.position.z - b.position.z) * axis.z) < radius(a, aa) + radius(b, bb) + 0.3;
      });
    };
    for (const old of records) {
      if (done.has(old.id)) continue;
      const anchor = deriveAnchor(context, old);
      if (!anchor) continue;
      const illegal = meaningful(placementIssues(context, old, { heightMode }), isBuilding(old.type));
      if (!illegal.length) continue;
      if (old.kind === "trafficLight") {
        unresolved.push({ id: old.id, issues: illegal });
        continue;
      }
      const road = context.road(anchor.anchorRoadId), path = context.path(road.id), length = polylineLength(path), sign = k.data.signs?.find((s) => s.id === old.id), overhead = sign && ["gantry", "highway-gantry", "ceiling"].includes(sign.template);
      const candidates = [];
      for (const delta of [0, -5, 5, -12, 12, -25, 25, -45, 45]) for (const gap of overhead ? [0] : isBuilding(old.type) ? [2, 6, 12, 20, 30, 45] : [1, 2, 4, 7, 12]) {
        const station = Math.max(0, Math.min(length, anchor.station + delta)), side = sign ? sign.laneDirection === "reverse" ? -1 : 1 : anchor.lateralOffset < 0 ? -1 : 1;
        const radius = old.size.trunkRadius ?? Math.hypot(old.size.width, old.size.depth) / 2;
        const placement = brushPosition(context, { mode: "SINGLE", type, roadId: road.id, heightMode, heightOffset: 0, lateralOffset: overhead ? -Math.max(-roadEdges(road).left, roadEdges(road).right) : radius + gap, orientation: sign ? "FACE_TRAFFIC" : "ROAD_FORWARD", direction: sign?.laneDirection ?? (road.travelDirection === "reverse" ? "reverse" : "forward") }, station, side);
        if (overhead) placement.position = { ...sampleAt(path, station).point };
        const candidate = { ...old, position: placement.position, rotation: placement.rotation }, travel = Math.hypot(candidate.position.x - old.position.x, candidate.position.z - old.position.z, (candidate.position.y ?? 0) - (old.position.y ?? 0));
        if (travel > (isBuilding(type) ? 65 : 55)) continue;
        const issues = placementIssues(context, candidate, { heightMode, minDistanceToObject: 0.6 });
        if (meaningful(issues, isBuilding(type)).length) continue;
        if (isBuilding(type) && nearbyObjects(context, bounds([candidate.position], radius + 5)).some((other) => other.id !== old.id && solid(other.type) && other.kind === "prefab" && rectOverlap(candidate, other))) continue;
        if (!isBuilding(type) && issues.some((i) => i.code === "object.tooCloseToObject" || i.code === "tree.canopyOccludesSign")) continue;
        candidates.push({ candidate, travel, station });
      }
      const best = candidates.sort((a, b) => a.travel - b.travel)[0];
      if (best) {
        ops.push(old.kind === "sign" ? { op: "modifySign", id: old.id, properties: { position: best.candidate.position, heading: best.candidate.rotation, stationMetres: best.station, ...sign?.postBaseY === void 0 ? {} : { postBaseY: Math.min(sign.postBaseY, best.candidate.position.y ?? 0) } } } : { op: "modifyObject", id: old.id, properties: { position: best.candidate.position, rotation: best.candidate.rotation } });
      } else if (old.type === "tree" || old.type.startsWith("streetlight")) ops.push({ op: "removeObject", id: old.id });
      else unresolved.push({ id: old.id, issues: illegal });
    }
    tx("objects-pass" + pass + "-" + index++, ops, { key, request, brushStats: plan.stats, unresolved });
  }
}
if (mode === "finish-objects") {
  const initial = analysisContext(k.data), terrain = regionalTerrainSampler(k.data), records = editableObjects(initial), groups = /* @__PURE__ */ new Map(), review = [];
  const append = (o, op) => {
    const key = (o.position.z < 0 ? "north" : "south") + (o.position.x < 0 ? "-west" : "-east"), list = groups.get(key) ?? [];
    list.push(op);
    groups.set(key, list);
  };
  const bad = (issues) => issues.filter((i) => i.severity !== "info" && !["object.tooCloseToObject", "object.unsupportedOnDeck", "object.wrongStructureLevel", "object.floating", "object.buried", "roadSign.wrongSide", "streetlight.tooDense"].includes(i.code));
  for (const o of records) {
    const issues = bad(objectIssues(initial, o));
    if (!issues.length) continue;
    if (o.kind === "trafficLight") {
      const j = k.data.intersections.find((j2) => j2.id === o.intersectionId), signal = signalApproach(k.data, j, o.approach), candidates = [];
      for (const along of [6, 10, 16, 24, 32, 45]) for (const gap of [1, 2, 4, 7, 12]) {
        const position = { x: signal.mouth.x + signal.outward.x * along + signal.right.x * (signal.roadWidth / 2 + gap), y: j.position.y ?? 0, z: signal.mouth.z + signal.outward.z * along + signal.right.z * (signal.roadWidth / 2 + gap) };
        const candidate = { ...o, position, rotation: signal.expectedHeading };
        if (!bad(objectIssues(initial, candidate)).length) candidates.push({ position, travel: Math.hypot(position.x - o.position.x, position.z - o.position.z) });
      }
      const best = candidates.sort((a, b) => a.travel - b.travel)[0];
      if (best) append(o, { op: "setSignalPlacement", intersectionId: j.id, approach: o.approach, position: best.position, heading: signal.expectedHeading });
      else review.push({ id: o.id, unresolved: issues });
    } else if (o.kind === "sign") {
      const s = k.data.signs.find((s2) => s2.id === o.id), road = initial.road(s.roadId), path = initial.path(road.id), length = polylineLength(path), anchor = deriveAnchor(initial, o), edges = roadEdges(road), forward = s.laneDirection !== "reverse", overhead = ["gantry", "highway-gantry", "ceiling"].includes(s.template), candidates = [];
      for (const delta of [0, -5, 5, -15, 15, -30, 30, -60, 60, -100, 100]) for (const gap of [1, 2, 4, 7, 12, 18]) for (const side of [1, -1]) {
        const station = Math.max(0, Math.min(length, anchor.station + delta)), frame = sampleAt(path, station), placement = brushPosition(initial, { mode: "SINGLE", type: "roadSign", roadId: road.id, heightMode: "ROAD_SURFACE", orientation: "FACE_TRAFFIC", direction: s.laneDirection, lateralOffset: gap }, station, forward ? side : -side);
        const next = { ...s, position: overhead ? frame.point : placement.position, heading: placement.rotation, stationMetres: station };
        const half = road.laneCount * road.laneWidth / 2, shoulder = forward ? road.shoulders?.right ?? 0 : road.shoulders?.left ?? 0;
        if (s.template === "gantry") next.postOffset = side * (half + (shoulder >= 1 ? Math.min(shoulder - 0.4, gap) : gap));
        if (s.template === "highway-gantry") next.gantryPosts = [-half - Math.min(road.shoulders?.left ?? 1, 0.8), half + Math.min(road.shoulders?.right ?? 1, 0.8)];
        const ground = terrain.heightAt(next.position.x, next.position.z), base = next.position.y ?? 0;
        if (s.postBaseY !== void 0) next.postBaseY = Math.min(base, ground);
        const overlay = Object.create(initial);
        Object.defineProperty(overlay, "map", { value: { ...k.data, signs: [next] } });
        const checks = bad(objectIssues(overlay, { ...o, position: next.position, rotation: next.heading }));
        if (checks.length) continue;
        const travel = Math.hypot(next.position.x - o.position.x, next.position.z - o.position.z);
        candidates.push({ next, score: travel + Math.abs((next.postOffset ?? 0) - (s.postOffset ?? 0)) * 0.15 });
      }
      const best = candidates.sort((a, b) => a.score - b.score)[0];
      if (best) {
        const { id, ...properties } = best.next;
        append(o, { op: "modifySign", id, properties });
      } else review.push({ id: o.id, unresolved: issues });
    } else if (isBuilding(o.type)) {
      const anchor = deriveAnchor(initial, o);
      if (!anchor) continue;
      const path = initial.path(anchor.anchorRoadId), length = polylineLength(path), radius = Math.hypot(o.size.width, o.size.depth) / 2, candidates = [];
      for (const delta of [0, -30, 30, -60, 60, -100, 100]) for (const gap of [1, 8, 20, 35]) for (const side of [anchor.lateralOffset < 0 ? -1 : 1]) {
        const placement = brushPosition(initial, { mode: "SINGLE", type: o.type, roadId: anchor.anchorRoadId, heightMode: "GROUND", lateralOffset: radius + gap, orientation: "ROAD_FORWARD" }, Math.max(0, Math.min(length, anchor.station + delta)), side);
        const candidate = { ...o, position: placement.position, rotation: placement.rotation }, travel = Math.hypot(candidate.position.x - o.position.x, candidate.position.z - o.position.z);
        if (travel > 160 || bad(objectIssues(initial, candidate)).length) continue;
        if (nearbyObjects(initial, bounds([candidate.position], radius + 5)).some((other) => other.id !== o.id && isBuilding(other.type) && Math.abs((candidate.position.y ?? 0) - (other.position.y ?? 0)) < Math.max(candidate.size.height, other.size.height) && Math.hypot(other.position.x - candidate.position.x, other.position.z - candidate.position.z) < radius + Math.hypot(other.size.width, other.size.depth) / 2 + 1)) continue;
        candidates.push({ candidate, travel });
      }
      const best = candidates.sort((a, b) => a.travel - b.travel)[0];
      if (best) append(o, { op: "modifyObject", id: o.id, properties: { position: best.candidate.position, rotation: best.candidate.rotation } });
      else if (o.type !== "stadium") append(o, { op: "removeObject", id: o.id });
      else review.push({ id: o.id, unresolved: issues });
    } else if (["guardrail", "noise_barrier", "traffic_sign", "guide_sign", "green_strip", "hardscape"].includes(o.type)) append(o, { op: "removeObject", id: o.id });
  }
  save("final-object-reviews", review);
  for (const [region, ops] of groups) tx("object-" + (process.argv[3] ?? "conflicts") + "-" + region, ops, { review, reason: "Remaining physical supports, structures and obstructing surface props after brush repair" });
}
if (mode === "replay-signs") {
  for (const region of ["north-west", "south-east", "south-west", "north-east"]) {
    const previous = JSON.parse(readFileSync(`${dir}/object-conflicts-${region}-preview.json`, "utf8"));
    tx("sign-explicit-transform-" + region, previous.operations.filter((op) => op.op === "modifySign"), { reason: "Replay exact reviewed transforms after station override bug fix" });
  }
}
if (mode === "reading") {
  const c = analysisContext(k.data), audit = auditFastRoadSigns(k.data), badIds = new Set(audit.conflicts.flatMap((pair) => [pair.a, pair.b])), ops = [], planned = [...k.data.signs], unresolved = [];
  save("reading-before", audit);
  for (const s of k.data.signs) {
    const road = c.road(s.roadId), path = c.path(road.id), length = polylineLength(path), anchor = deriveAnchor(c, editableObjects(c).find((o) => o.id === s.id));
    if (s.type === "SPEED_LIMIT" && s.speedLimitKmh !== road.speedLimit) ops.push({ op: "modifySign", id: s.id, properties: { speedLimitKmh: road.speedLimit } });
    if (!badIds.has(s.id)) continue;
    const conflict = (candidate) => planned.some((other) => other.id !== s.id && !isSafetySign(other) && signReadingConflict(candidate, other, Math.max(45, Math.min(120, Math.max(road.speedLimit, c.road(other.roadId).speedLimit) * 0.9))));
    if (!conflict(s)) continue;
    let selected;
    for (const delta of [-10, 10, -25, 25, -50, 50, -80, 80, -120, 120, -180, 180]) {
      const station = anchor.station + delta;
      if (station < 5 || station > length - 5) continue;
      const frame = sampleAt(path, station), position = { x: frame.point.x - frame.tangent.z * anchor.lateralOffset, y: frame.point.y, z: frame.point.z + frame.tangent.x * anchor.lateralOffset }, heading = Math.atan2(-frame.tangent.x, -frame.tangent.z) + (s.laneDirection === "reverse" ? Math.PI : 0), next = { ...s, position, heading, stationMetres: station };
      if (s.postBaseY !== void 0) next.postBaseY = Math.min(s.postBaseY, position.y ?? 0);
      const overlay = Object.create(c);
      Object.defineProperty(overlay, "map", { value: { ...k.data, signs: [next] } });
      if (objectIssues(overlay, { ...editableObjects(c).find((o) => o.id === s.id), position, rotation: heading }).some((i) => i.severity !== "info" && i.code !== "roadSign.wrongSide") || conflict(next)) continue;
      selected = next;
      break;
    }
    if (selected) {
      if (s.advanceMetres !== void 0) {
        const move = (selected.stationMetres - anchor.station) * (s.laneDirection === "reverse" ? -1 : 1);
        selected.actualAdvanceMetres = (s.actualAdvanceMetres ?? s.advanceMetres) - move;
        selected.destinations = s.destinations.map((d) => d.distanceMetres === void 0 ? d : { ...d, distanceMetres: Math.round(selected.actualAdvanceMetres) });
      }
      const { id, ...properties } = selected;
      ops.push({ op: "modifySign", id, properties });
      planned[planned.findIndex((o) => o.id === id)] = selected;
    } else unresolved.push(s.id);
  }
  save("reading-unresolved", unresolved);
  tx("reading-band-separation", ops, { audit, unresolved });
}
if (mode === "safety" || mode === "safety-min") {
  const c = analysisContext(k.data), clearance = new RoadClearance(k.data), ops = [], unresolved = [];
  const safe = (s) => {
    const d = signDimensions(s.template, s.size);
    return [-d.width / 2, 0, d.width / 2].every((x) => {
      const q = rotatePoint({ x, z: 0 }, s.heading);
      return !clearance.roadAt({ x: s.position.x + q.x, z: s.position.z + q.z }, 0.1, (s.position.y ?? 0) - 0.3, (s.position.y ?? 0) + d.bottom + d.height, void 0, void 0, true);
    });
  };
  const safetySource = mode === "safety-min" ? JSON.parse(readFileSync(`${dir}/safety-sign-clearances-diff.json`, "utf8")).signs.modified.map((s) => s.before) : k.data.signs.filter(isSafetySign);
  for (const s of safetySource) {
    const path = c.path(s.roadId), road = c.road(s.roadId), length = polylineLength(path), station = s.stationMetres, frame = sampleAt(path, station), heading = Math.atan2(-frame.tangent.x, -frame.tangent.z) + (s.laneDirection === "reverse" ? Math.PI : 0);
    const current = { ...s, position: { ...s.position, y: frame.point.y }, heading }, o = editableObjects(c).find((o2) => o2.id === s.id);
    const illegal = (candidate) => {
      const overlay = Object.create(c);
      Object.defineProperty(overlay, "map", { value: { ...k.data, signs: [candidate] } });
      return objectIssues(overlay, { ...o, position: candidate.position, rotation: candidate.heading }).some((i) => i.severity !== "info" && i.code !== "roadSign.wrongSide");
    };
    if (safe(current) && !illegal(current) && Math.abs((s.position.y ?? 0) - (frame.point.y ?? 0)) < 1e-7 && Math.abs(Math.atan2(Math.sin(s.heading - heading), Math.cos(s.heading - heading))) < 1e-7) continue;
    let selected;
    for (const delta of [0, -5, 5, -12, 12, -25, 25, -45, 45, -80, 80, -120, 120, -180, 180]) for (const gap of [-0.45, 0.8, 1.5, 3, 5, 8]) for (const side of [1, -1]) {
      const station2 = Math.max(2, Math.min(length - 2, (s.stationMetres ?? 0) + delta));
      if (gap < 0 && (s.laneDirection === "reverse" ? road.shoulders?.left ?? 0 : road.shoulders?.right ?? 0) < 1.2) continue;
      const placement = brushPosition(c, { mode: "SINGLE", type: "roadSign", roadId: road.id, heightMode: "ROAD_SURFACE", orientation: "FACE_TRAFFIC", direction: s.laneDirection, lateralOffset: gap }, station2, (s.laneDirection === "reverse" ? -1 : 1) * side), next = { ...s, position: placement.position, heading: placement.rotation, stationMetres: station2 };
      if (s.postBaseY !== void 0) next.postBaseY = placement.position.y;
      const a = sampleAt(path, Math.max(0, station2 - 25)).tangent, b = sampleAt(path, Math.min(length, station2 + 25)).tangent, turn2 = (a.x * b.z - a.z * b.x) * (s.laneDirection === "reverse" ? -1 : 1);
      if (s.type === "CHEVRON" && Math.abs(turn2) >= 1e-3) next.chevronDirection = turn2 > 0 ? "right" : "left";
      if (safe(next) && !illegal(next)) {
        const score = Math.hypot(next.position.x - s.position.x, next.position.z - s.position.z);
        if (!selected || score < selected.score) selected = { ...next, score };
      }
    }
    if (selected) {
      const { id, score, ...properties } = selected;
      ops.push({ op: "modifySign", id, properties });
    } else unresolved.push(s.id);
  }
  save(mode + "-unresolved", unresolved);
  tx(mode === "safety-min" ? "safety-minimal-displacement" : "safety-sign-clearances", ops, { unresolved });
}
if (mode === "last-signals") {
  const id = "urban-junction-234", j = k.data.intersections.find((j2) => j2.id === id), c = analysisContext(k.data), signal = signalApproach(k.data, j, "east"), o = editableObjects(c).find((o2) => o2.id === `signal:${id}:east`);
  save("last-signal-detail", k.inspectObject(o.id));
  const candidates = [];
  for (const along of [3, 6, 10, 16, 24, 32, 45, 60, 80]) for (const gap of [1, 2, 4, 7, 12, 18]) for (const height of [signal.height, 5.8, 4.8]) {
    if (j.signals?.profile && height < 7.2) continue;
    const position = { x: signal.mouth.x + signal.outward.x * along + signal.right.x * (signal.roadWidth / 2 + gap), y: j.position.y ?? 0, z: signal.mouth.z + signal.outward.z * along + signal.right.z * (signal.roadWidth / 2 + gap) }, candidate = { ...o, position, rotation: signal.expectedHeading, size: { ...o.size, height } };
    if (!objectIssues(c, candidate).some((i) => i.severity !== "info")) candidates.push({ position, height, score: along + gap + Math.abs(height - signal.height) * 5 });
  }
  const selected = candidates.sort((a, b) => a.score - b.score)[0];
  if (selected) tx("signal-port-works-visible", [{ op: "setSignalPlacement", intersectionId: id, approach: "east", position: selected.position, heading: signal.expectedHeading, poleHeight: selected.height }], { signal, selected });
  const badSign = "topology-sign:urban-junction-127|v4-diagonal-split-split-2-split|start:URBAN_DIRECTION";
  tx("remove-redundant-obstructing-sign", [{ op: "removeObject", id: badSign }], k.inspectObject(badSign));
}
if (mode === "supports") {
  const c = analysisContext(k.data), terrain = regionalTerrainSampler(k.data), groups = /* @__PURE__ */ new Map();
  for (const o of editableObjects(c)) {
    if (o.kind !== "prefab" || !["streetlight", "streetlight_small", "streetlight_dual", "streetlight_highway", "guardrail", "noise_barrier", "guide_sign", "traffic_sign", "station_platform"].includes(o.type)) continue;
    const ground = terrain.heightAt(o.position.x, o.position.z), y = o.position.y ?? 0;
    if (Math.abs(y - ground) < 0.4) continue;
    const supported = c.nearRoads(o.position, 60).some((hit) => {
      if (Math.abs((hit.point.y ?? 0) - y) > 0.35) return false;
      const road = hit.road, edges = roadEdges(road), sidewalk = road.sidewalk?.enabled ? road.sidewalk.width : 0, lateral = (o.position.x - hit.point.x) * -hit.tangent.z + (o.position.z - hit.point.z) * hit.tangent.x, along = Math.abs((o.position.x - hit.point.x) * hit.tangent.x + (o.position.z - hit.point.z) * hit.tangent.z);
      return along < 0.4 && lateral > edges.left - sidewalk - 0.5 && lateral < edges.right + sidewalk + 0.5;
    });
    if (supported) continue;
    const key = [Math.floor(o.position.x / 2500), Math.floor(o.position.z / 2500), o.type].join(":"), ids = groups.get(key) ?? [];
    ids.push(o.id);
    groups.set(key, ids);
  }
  let index = 0;
  for (const [key, ids] of groups) {
    const context = analysisContext(k.data), objects = editableObjects(context).filter((o) => ids.includes(o.id)), request = { mode: "REPAIR", type: objects[0].type, bbox: bounds(objects.map((o) => o.position), 1), objectIds: ids, heightMode: "GROUND", heightOffset: 0, orientation: "ROAD_FORWARD", autoAdjust: "ADJUST", maxAutoMove: 45, limit: 5e3 }, plan = k.planBrush(request), ops = [...plan.operations];
    const repaired = new Set(plan.candidates.filter((o) => o.state !== "INVALID").map((o) => o.id));
    for (const o of objects) if (!repaired.has(o.id)) ops.push({ op: "removeObject", id: o.id });
    tx("support-foundations-" + index++, ops, { key, request, plan });
  }
  const platform = k.data.objects.find((o) => o.id === "v61-station-platform--1-340");
  if (platform) {
    const plan = k.planBrush({ mode: "REPAIR", type: "station_platform", objectIds: [platform.id], bbox: bounds([platform.position], 1), heightMode: "GROUND", autoAdjust: "ADJUST", maxAutoMove: 45 });
    tx("station-platform-carriageway", plan.operations, { plan });
  }
}
if (mode === "compact-boards") {
  const c = analysisContext(k.data), ids = ["topology-sign:urban-junction-133|v5-civic-south|start:URBAN_DIRECTION", "topology-sign:urban-junction-180|v5-civic-south-split-4|start:URBAN_DIRECTION"], ops = [], review = [];
  for (const id of ids) {
    const s = k.data.signs.find((s2) => s2.id === id);
    if (!s) continue;
    const record = editableObjects(c).find((o) => o.id === id), anchor = deriveAnchor(c, record), road = c.road(s.roadId), length = polylineLength(c.path(road.id)), candidates = [];
    for (const delta of [0, -5, 5, -15, 15, -30, 30, -60, 60]) for (const gap of [2, 3, 5, 8]) for (const side of [1, -1]) {
      const station = Math.max(2, Math.min(length - 2, anchor.station + delta)), placement = brushPosition(c, { mode: "SINGLE", type: "roadSign", roadId: road.id, heightMode: "ROAD_SURFACE", orientation: "FACE_TRAFFIC", direction: s.laneDirection, lateralOffset: gap }, station, (s.laneDirection === "reverse" ? -1 : 1) * side), next = { ...s, template: "ramp-confirmation", size: "small", position: placement.position, heading: placement.rotation, stationMetres: station, postOffset: void 0, gantryPosts: void 0, postBaseY: void 0 };
      const overlay = Object.create(c);
      Object.defineProperty(overlay, "map", { value: { ...k.data, signs: [next] } });
      if (objectIssues(overlay, { ...record, position: next.position, rotation: next.heading }).some((i) => i.severity !== "info" && i.code !== "roadSign.wrongSide")) continue;
      candidates.push({ next, score: Math.hypot(next.position.x - s.position.x, next.position.z - s.position.z) });
    }
    const best = candidates.sort((a, b) => a.score - b.score)[0];
    review.push({ id, before: s, selected: best });
    if (best) {
      const { id: id2, ...properties } = best.next;
      ops.push({ op: "modifySign", id: id2, properties });
    } else ops.push({ op: "removeObject", id });
  }
  tx("compact-roadside-guides-under-bridge", ops, review);
  const platform = k.data.objects.find((o) => o.id === "v61-station-platform--1-340");
  if (platform) {
    const context = analysisContext(k.data), record = editableObjects(context).find((o) => o.id === platform.id), anchor = deriveAnchor(context, record), length = polylineLength(context.path(anchor.anchorRoadId)), candidates = [];
    for (const delta of [0, -5, 5, -15, 15, -30, 30]) for (const gap of [12, 16, 22, 30]) {
      const at = brushPosition(context, { mode: "SINGLE", type: "station_platform", roadId: anchor.anchorRoadId, heightMode: "GROUND", orientation: "ROAD_FORWARD", lateralOffset: gap }, Math.max(0, Math.min(length, anchor.station + delta)), anchor.lateralOffset < 0 ? -1 : 1), candidate = { ...record, position: at.position, rotation: at.rotation };
      if (objectIssues(context, candidate).some((i) => i.severity !== "info")) continue;
      candidates.push({ candidate, score: Math.hypot(candidate.position.x - record.position.x, candidate.position.z - record.position.z) });
    }
    const best = candidates.sort((a, b) => a.score - b.score)[0];
    if (best) tx("station-roof-clearance", [{ op: "modifyObject", id: platform.id, properties: { position: best.candidate.position, rotation: best.candidate.rotation } }], { record, best });
  }
}
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2025 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
