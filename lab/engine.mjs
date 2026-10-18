// Safety Net Lab engine: a faithful JavaScript port of patient-v0 RideBookingService,
// switchable "broken copies" (mutants), probe execution and the suspected-bug answer key.
// Parity with the real Java class is checked by tests/parity.test.mjs.

const jtrim = (s) => s.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
const up = (s) => s.toUpperCase();
const eqi = (a, b) => a != null && up(a) === up(b);
const isType = (t) => t != null && (eqi(t, 'MINI') || eqi(t, 'SEDAN') || eqi(t, 'SUV'));
const javaRound = (x) => (Number.isNaN(x) ? 0 : Math.floor(x + 0.5));
// String.valueOf(double) for the small values this class produces.
export const jd = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

class JavaError extends Error {
  constructor(cls, msg) { super(msg ?? cls); this.cls = cls; this.jmsg = msg; }
  toString() { return this.jmsg == null ? this.cls : `${this.cls}: ${this.jmsg}`; }
}

export class RideService {
  constructor(mutants = new Set()) {
    this.m = mutants;
    this.drv = [];
    this.rides = new Map();
    this.sms = [];
    this.counter = 1000;
  }

  has(id) { return this.m.has(id); }

  registerDriver(name, type) {
    if (name == null || (this.has('R5') ? name === '' : jtrim(name) === '')) return false;
    if (!isType(type)) return false;
    const dup = this.drv.some((d) => (this.has('R4') ? eqi(d.name, name) : d.name === name));
    if (dup) return false;
    this.drv.push({ name, type, free: true, tot: this.has('R1') ? 0 : 5, cnt: this.has('R1') ? 0 : 1 });
    return true;
  }

  calcFare(type, km, hour, promo) {
    if (this.has('X2') && km <= 0) throw new JavaError('java.lang.IllegalArgumentException', 'bad km: ' + jd(km));
    if (type == null) throw new JavaError('java.lang.NullPointerException', null);
    let f = 0;
    const short = this.has('M1') && eqi(type, 'MINI') ? km < 10 : km <= 10;
    if (eqi(type, 'MINI')) f = short ? km * 12 : km * 10;
    else if (eqi(type, 'SEDAN')) f = short ? km * 15 : km * (this.has('M2') ? 15 : 13);
    else if (eqi(type, 'SUV')) {
      f = short ? km * 20 : km * 17;
      const late = this.has('M3') ? hour > 22 : hour >= 22;
      const early = this.has('M4') ? hour <= 6 : hour < 6;
      const inRange = !this.has('X1') || (hour >= 0 && hour <= 23);
      if ((late || early) && inRange && !this.has('M8')) f = f * 1.25;
    } else {
      throw new JavaError('java.lang.IllegalArgumentException', (this.has('X3') ? 'unknown type: ' : 'bad type: ') + type);
    }
    if (promo != null && (this.has('M11') || promo !== '') && (this.has('M9') || promo !== 'NONE')) {
      if (promo === 'FLAT30') f = f - (this.has('M5') ? 20 : 30);
      else f = f * (this.has('M6') ? 0.85 : 0.9);
    }
    if (eqi(type, 'MINI') && f < (this.has('M7') ? 60 : 50)) f = this.has('M7') ? 60 : 50;
    if (eqi(type, 'SEDAN') && f < 70) f = 70;
    if (eqi(type, 'SUV') && f < (this.has('M12') ? 90 : 100)) f = this.has('M12') ? 90 : 100;
    return this.has('M10') ? Math.floor(f) : javaRound(f);
  }

  bookRide(name, phone, pickup, drop, km, type, hour, promo, sendSms) {
    if (name == null || jtrim(name) === '') return 'ERR:NAME';
    if (phone == null || !(this.has('B1') ? /^\d{10,11}$/ : /^\d{10}$/).test(phone)) return 'ERR:PHONE';
    if (!(km > 0 && (this.has('B2') ? km < 100 : km <= 100))) return 'ERR:DISTANCE';
    if (!isType(type)) return 'ERR:TYPE';
    const d = this.drv.find((x) => eqi(x.type, type) && x.free);
    if (!d) return 'ERR:NO_DRIVER';
    let f;
    if (eqi(type, 'MINI')) f = km <= 10 ? km * 12 : km * 10;
    else if (eqi(type, 'SEDAN')) f = km <= 10 ? km * 15 : km * 13;
    else { f = km <= 10 ? km * 20 : km * 17; if (hour >= 22 || hour < 6) f = f * 1.25; }
    const minimum = () => {
      if (eqi(type, 'MINI') && f < 50) f = 50;
      if (eqi(type, 'SEDAN') && f < 70) f = 70;
      if (eqi(type, 'SUV') && f < 100) f = 100;
    };
    const discount = () => {
      if (promo != null && promo !== '' && promo !== 'NONE') f = promo === 'FLAT30' ? f - 30 : f * 0.9;
    };
    if (this.has('B3')) { discount(); minimum(); } else { minimum(); discount(); }
    f = javaRound(f);
    this.counter++;
    const id = 'RIDE-' + this.counter;
    if (!this.has('B5')) d.free = false;
    this.rides.set(id, { id, name, phone, km, type: up(type), fare: f, driver: d.name, status: 'BOOKED' });
    if (sendSms) {
      const masked = this.has('B4') ? '*******' + phone.substring(7) : '******' + phone.substring(6);
      this.sms.push(`SMS to ${masked}: Ride ${id} confirmed. Driver ${d.name}. Fare Rs.${Math.trunc(f)}`);
    }
    return id;
  }

  getRideFare(id) { const r = this.rides.get(id); return r ? r.fare : -1; }

  getRideSummary(id) {
    const r = this.rides.get(id);
    if (!r) return 'NOT FOUND';
    const km = this.has('B6') ? String(r.km) : jd(r.km);
    return `${r.id} | ${r.name} | ${r.type} | ${km} km | Rs.${Math.trunc(r.fare)} | ${r.driver} | ${r.status}`;
  }

  cancelRide(id, minutes) {
    const r = this.rides.get(id);
    if (!r) return -1;
    if (r.status !== 'BOOKED') return this.has('C3') ? -1 : 0;
    let fee = 0;
    if (this.has('C1') ? minutes >= 5 : minutes > 5) fee = r.type === 'MINI' ? 25 : r.type === 'SEDAN' ? (this.has('C2') ? 45 : 40) : 60;
    r.status = 'CANCELLED';
    if (!this.has('C4')) for (const d of this.drv) if (d.name === r.driver) d.free = true;
    return fee;
  }

  completeRide(id, rating) {
    const r = this.rides.get(id);
    if (!r) return 'ERR:RIDE';
    if (r.status !== 'BOOKED') return 'ERR:STATE';
    if (rating < 1 || (this.has('R3') ? rating >= 5 : rating > 5)) return 'ERR:RATING';
    r.status = 'COMPLETED';
    for (const d of this.drv) if (d.name === r.driver) { d.free = true; d.tot += rating; d.cnt += 1; }
    return 'OK';
  }

  getDriverRating(name) {
    const d = this.drv.find((x) => x.name === name);
    if (!d) return 0;
    const avg = d.tot / d.cnt;
    return this.has('R2') ? javaRound(avg) : javaRound(avg * 10) / 10;
  }

  availableDrivers(type) { return this.drv.filter((x) => eqi(x.type, type) && x.free).length; }
}

// ---- Probes -------------------------------------------------------------------------------

export const RIDER = { name: 'Riya', phone: '9876543210' };
const fixture = (m) => {
  const s = new RideService(m);
  s.registerDriver('Asha', 'MINI');
  s.registerDriver('Bala', 'SEDAN');
  s.registerDriver('Chen', 'SUV');
  return s;
};
const safe = (fn) => { try { return fn(); } catch (e) { if (e instanceof JavaError) return 'error=' + e.toString(); throw e; } };

export const PROBE_KINDS = {
  fare: { label: 'Fare estimate: calcFare(type, km, hour, promo)', fields: ['type', 'km', 'hour', 'promo'] },
  book: { label: 'Book a ride: bookRide(...) then getRideFare / getRideSummary / getSmsLog', fields: ['name', 'phone', 'type', 'km', 'hour', 'promo'] },
  cancel: { label: 'Cancel: book Riya a ride, optionally complete it, then cancelRide(id, minutes)', fields: ['type', 'km', 'minutes', 'completeFirst'] },
  rate: { label: 'Ratings: complete one MINI ride per rating with Asha, then getDriverRating', fields: ['ratings'] },
  register: { label: 'Register two drivers: registerDriver(name1, type1), registerDriver(name2, type2)', fields: ['name1', 'type1', 'name2', 'type2'] },
};

// Normalise untrusted input. Blank text = null, the literal '' = empty string (same as @CsvSource).
const text = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || v.length > 40) throw new Error('text fields are strings of at most 40 characters');
  if (v === '') return null;
  if (v === "''") return '';
  return v;
};
const num = (v, lo, hi, int) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) throw new Error(`number out of range ${lo}..${hi}`);
  return n;
};

export function normaliseProbe(kind, raw) {
  if (!PROBE_KINDS[kind] || typeof raw !== 'object' || raw === null) throw new Error('unknown probe kind');
  const i = {};
  switch (kind) {
    case 'fare': i.type = text(raw.type); i.km = num(raw.km, -1000, 1000); i.hour = num(raw.hour, -100, 100, true); i.promo = text(raw.promo); break;
    case 'book': i.name = text(raw.name); i.phone = text(raw.phone); i.type = text(raw.type); i.km = num(raw.km, -1000, 1000); i.hour = num(raw.hour, -100, 100, true); i.promo = text(raw.promo); break;
    case 'cancel': i.type = text(raw.type); i.km = num(raw.km, -1000, 1000); i.minutes = num(raw.minutes, -1000, 100000, true); i.completeFirst = raw.completeFirst === true || raw.completeFirst === 'true'; break;
    case 'rate': {
      const parts = String(raw.ratings ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '');
      if (parts.length < 1 || parts.length > 10) throw new Error('give 1 to 10 comma-separated ratings');
      i.ratings = parts.map((p) => num(p, -10, 10, true));
      break;
    }
    case 'register': i.name1 = text(raw.name1); i.type1 = text(raw.type1); i.name2 = text(raw.name2); i.type2 = text(raw.type2); break;
  }
  return i;
}

// Returns the observable behaviour as one canonical string.
export function runProbe(kind, i, mutants = new Set()) {
  switch (kind) {
    case 'fare': return safe(() => 'fare=' + jd(new RideService(mutants).calcFare(i.type, i.km, i.hour, i.promo)));
    case 'book': {
      const s = fixture(mutants);
      const id = s.bookRide(i.name, i.phone, 'Gate 1', 'Gate 2', i.km, i.type, i.hour, i.promo, true);
      return [`id=${id}`, `fare=${jd(s.getRideFare(id))}`, `summary=${s.getRideSummary(id)}`,
        `sms=[${s.sms.join(' || ')}]`, `free=${i.type == null ? 0 : s.availableDrivers(i.type)}`].join('\n');
    }
    case 'cancel': {
      const s = fixture(mutants);
      const id = s.bookRide(RIDER.name, RIDER.phone, 'Gate 1', 'Gate 2', i.km, i.type, 12, null, false);
      const done = i.completeFirst ? s.completeRide(id, 5) : '-';
      const fee = s.cancelRide(id, i.minutes);
      return [`id=${id}`, `complete=${done}`, `fee=${jd(fee)}`, `summary=${s.getRideSummary(id)}`,
        `free=${i.type == null ? 0 : s.availableDrivers(i.type)}`].join('\n');
    }
    case 'rate': {
      const s = fixture(mutants);
      const results = i.ratings.map((r) => { const id = s.bookRide(RIDER.name, RIDER.phone, 'A', 'B', 5, 'MINI', 12, null, false); return s.completeRide(id, r); });
      return `complete=[${results.join(',')}]\nrating=${jd(s.getDriverRating('Asha'))}`;
    }
    case 'register': {
      const s = new RideService(mutants);
      const a = s.registerDriver(i.name1, i.type1);
      const b = s.registerDriver(i.name2, i.type2);
      return `first=${a}\nsecond=${b}\nfree1=${i.type1 == null ? 0 : s.availableDrivers(i.type1)}`;
    }
  }
  throw new Error('unknown probe kind');
}

// ---- Mutants (secretly broken copies) -----------------------------------------------------

export const MUTANTS = {
  M1: 'MINI short-trip boundary km<=10 became km<10', M2: 'SEDAN long-trip rate 13 became 15',
  M3: 'Night starts after 22:00 instead of at 22:00', M4: 'Night ends at 06:00 inclusive',
  M5: 'FLAT30 takes 20 off', M6: 'Other promos take 15% off', M7: 'MINI minimum fare 60',
  M8: 'SUV night surcharge dropped', M9: 'Promo NONE gets a discount', M10: 'Fare truncated instead of rounded',
  M11: 'Empty promo gets a discount', M12: 'SUV minimum fare 90',
  B1: 'Phone accepts 11 digits', B2: '100 km rides rejected', B3: 'bookRide discounts before minimum',
  B4: 'SMS masks 7 digits', B5: 'Booked driver stays available', B6: 'Summary prints km without .0',
  C1: 'Cancellation fee from 5 minutes', C2: 'SEDAN cancellation fee 45', C3: 'Cancelling a finished ride returns -1',
  C4: 'Cancelled driver not freed',
  R1: 'New drivers start with no 5-star seed', R2: 'Driver rating rounded to whole stars', R3: 'Rating 5 rejected',
  R4: 'Duplicate driver check ignores case', R5: 'Whitespace-only driver name accepted',
  X1: 'Out-of-range hours get no night surcharge', X2: 'calcFare rejects km <= 0', X3: 'Bad type message changed',
};
// ---- Suspected bugs (answer key) ----------------------------------------------------------

const promoUp = (p) => (p == null ? null : up(p));
export const BUGS = {
  'night-suv-only': { label: 'Night surcharge only applies to SUV', exhibits: (k, i) => k === 'fare' && (eqi(i.type, 'MINI') || eqi(i.type, 'SEDAN')) && Number.isInteger(i.hour) && (i.hour >= 22 || (i.hour >= 0 && i.hour < 6)) && i.km > 0 },
  'unknown-promo-discount': { label: 'Any unknown promo code gets 10% off', exhibits: (k, i) => (k === 'fare' || k === 'book') && i.promo != null && i.promo !== '' && !['FLAT30', 'NONE'].includes(promoUp(i.promo)) },
  'promo-case-sensitive': { label: 'Promo codes are case-sensitive', exhibits: (k, i) => (k === 'fare' || k === 'book') && i.promo != null && ['FLAT30', 'NONE'].includes(promoUp(i.promo)) && i.promo !== promoUp(i.promo) },
  'estimate-booking-mismatch': { label: 'Booked fare differs from the estimate (promo vs minimum order)', exhibits: (k, i) => {
    if (k !== 'book') return false;
    const s = fixture(new Set());
    const id = s.bookRide(i.name, i.phone, 'G1', 'G2', i.km, i.type, i.hour, i.promo, false);
    if (!id.startsWith('RIDE-')) return false;
    try { return new RideService().calcFare(i.type, i.km, i.hour, i.promo) !== s.getRideFare(id); } catch { return false; }
  } },
  'cancel-finished-ride': { label: 'Cancelling a completed ride silently returns 0', exhibits: (k, i) => k === 'cancel' && i.completeFirst && isType(i.type) && i.km > 0 && i.km <= 100 },
  'seeded-rating': { label: 'New drivers start with a hidden 5-star rating', exhibits: (k, i) => k === 'rate' && i.ratings.some((r) => r >= 1 && r <= 5) },
  'duplicate-driver-case': { label: 'Duplicate driver check is case-sensitive', exhibits: (k, i) => k === 'register' && i.name1 != null && i.name2 != null && i.name1 !== i.name2 && eqi(i.name1, i.name2) && jtrim(i.name1) !== '' && isType(i.type1) && isType(i.type2) },
  'hour-not-validated': { label: 'Hours outside 0-23 are accepted (and count as night)', exhibits: (k, i) => k === 'fare' && eqi(i.type, 'SUV') && (i.hour < 0 || i.hour > 23) && i.km > 0 },
  'km-not-validated': { label: 'calcFare accepts zero or negative km', exhibits: (k, i) => k === 'fare' && isType(i.type) && i.km <= 0 },
};
export const DECOY_BUGS = {
  'round-half-up': 'Fares round half up', 'sms-masking': 'SMS hides the first six phone digits', 'long-distance-rate': 'Long trips get a cheaper per-km rate',
};

// ---- Difficulty levels --------------------------------------------------------------------

const FARE_M = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];
export const DIFFICULTIES = {
  easy: { code: 1, label: 'Easy — fare estimates', skillLevel: 'beginner', kinds: ['fare'], requiredProbes: 5,
    mutants: ['M1', 'M2', 'M3', 'M5', 'M6', 'M7', 'M8', 'M12'], bugs: ['night-suv-only', 'unknown-promo-discount', 'promo-case-sensitive'] },
  medium: { code: 2, label: 'Medium — booking and cancellation', skillLevel: 'intermediate', kinds: ['fare', 'book', 'cancel'], requiredProbes: 8,
    mutants: [...FARE_M, 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3'], bugs: ['night-suv-only', 'unknown-promo-discount', 'promo-case-sensitive', 'estimate-booking-mismatch', 'cancel-finished-ride'] },
  hard: { code: 3, label: 'Hard — the whole service', skillLevel: 'advanced', kinds: ['fare', 'book', 'cancel', 'rate', 'register'], requiredProbes: 10,
    mutants: [...FARE_M, 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C1', 'C2', 'C3', 'C4', 'R1', 'R2', 'R3', 'R4', 'R5'],
    bugs: ['night-suv-only', 'unknown-promo-discount', 'promo-case-sensitive', 'estimate-booking-mismatch', 'cancel-finished-ride', 'seeded-rating', 'duplicate-driver-case'] },
  complex: { code: 4, label: 'Complex — every edge, subtle mutants', skillLevel: 'advanced', kinds: ['fare', 'book', 'cancel', 'rate', 'register'], requiredProbes: 12,
    mutants: Object.keys(MUTANTS), bugs: Object.keys(BUGS) },
};

// Evaluate locked probes against a difficulty's mutants and answer key.
export function evaluate(difficulty, probes) {
  const d = DIFFICULTIES[difficulty];
  const killed = d.mutants.filter((mid) => probes.some((p) => runProbe(p.kind, p.input, new Set([mid])) !== p.expected));
  const found = new Set();
  let falseFlags = 0;
  for (const p of probes) {
    if (!p.flag) continue;
    if (d.bugs.includes(p.flag) && BUGS[p.flag].exhibits(p.kind, p.input)) found.add(p.flag);
    else falseFlags++;
  }
  return { killed, bugsFound: [...found], falseFlags };
}

export const rating = (succ, obs, min) => {
  if (obs < min) return null;
  const r = succ / obs;
  return r >= 0.9 ? 5 : r >= 0.7 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;
};
