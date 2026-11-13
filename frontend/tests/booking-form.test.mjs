import { test, describe, it, mock } from 'node:test';
import assert from 'node:assert';

// Business logic and validation helper extracted from availability booking form
export function validateBookingForm({ bookingDate, startTime, endTime, purpose }) {
  if (!bookingDate || !startTime || !endTime || !purpose || !purpose.trim()) {
    return { valid: false, error: 'Please fill in all required booking fields.' };
  }

  const startDateObj = new Date(`${bookingDate}T${startTime}:00`);
  const endDateObj = new Date(`${bookingDate}T${endTime}:00`);

  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return { valid: false, error: 'Invalid date or time format provided.' };
  }

  if (startDateObj >= endDateObj) {
    return { valid: false, error: 'End time must be strictly after start time.' };
  }

  return {
    valid: true,
    startIso: startDateObj.toISOString(),
    endIso: endDateObj.toISOString(),
    purpose: purpose.trim(),
  };
}

export function formatBookingError(err) {
  if (err.status === 409 || err.errorCode === 'booking_conflict') {
    return 'DATABASE CONFLICT (HTTP 409): The requested time slot is already reserved for this resource. PostgreSQL btree_gist exclusion constraint prevented overlapping reservations. Please select an available slot.';
  }
  return err.message || 'Booking creation failed. Please verify selected times.';
}

describe('Booking Form Validation & 409 Conflict Handling', () => {
  it('should reject booking when required fields are missing', () => {
    const res = validateBookingForm({
      bookingDate: '',
      startTime: '10:00',
      endTime: '12:00',
      purpose: 'Lab session',
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'Please fill in all required booking fields.');
  });

  it('should reject booking when purpose is empty or whitespace only', () => {
    const res = validateBookingForm({
      bookingDate: '2027-02-01',
      startTime: '10:00',
      endTime: '12:00',
      purpose: '   ',
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'Please fill in all required booking fields.');
  });

  it('should reject booking when end time is before or equal to start time', () => {
    const res = validateBookingForm({
      bookingDate: '2027-02-01',
      startTime: '14:00',
      endTime: '12:00',
      purpose: 'AI Experiment',
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'End time must be strictly after start time.');
  });

  it('should validate and parse valid booking form inputs into ISO timestamps', () => {
    const res = validateBookingForm({
      bookingDate: '2027-02-01',
      startTime: '10:00',
      endTime: '12:00',
      purpose: 'Distributed Systems practical session',
    });
    assert.strictEqual(res.valid, true);
    assert.ok(res.startIso.includes('2027-02-01'));
    assert.ok(res.endIso.includes('2027-02-01'));
    assert.strictEqual(res.purpose, 'Distributed Systems practical session');
  });

  it('should format HTTP 409 Conflict errors into user-friendly GiST exclusion message', () => {
    const mockConflictError = {
      status: 409,
      errorCode: 'booking_conflict',
      message: 'The selected time slot is no longer available. Please choose another slot.',
    };

    const errorMessage = formatBookingError(mockConflictError);
    assert.ok(errorMessage.includes('DATABASE CONFLICT (HTTP 409)'));
    assert.ok(errorMessage.includes('PostgreSQL btree_gist exclusion constraint prevented overlapping reservations'));
  });

  it('should format general HTTP errors with default or custom message', () => {
    const mockGenericError = {
      status: 400,
      message: 'Booking duration exceeds maximum allowed 4 hours.',
    };

    const errorMessage = formatBookingError(mockGenericError);
    assert.strictEqual(errorMessage, 'Booking duration exceeds maximum allowed 4 hours.');
  });
});
