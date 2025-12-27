require('dotenv').config();
const moment = require('moment');
const pool = require('../db');

const CLIENT_CODE = 'CODIGIX01';
const DEMO_TOUR_CODE = 'GT-DEMO-001';
const PAY_PENDING_GUEST = 'GT-DEMO-PAYPENDING';

const numericId = () => Number(`${Date.now()}${Math.floor(Math.random() * 90 + 10)}`);

const getFirstId = async (conn, table, column) => {
  const [rows] = await conn.query(`SELECT ${column} AS id FROM ${table} ORDER BY ${column} LIMIT 1`);
  if (!rows.length) throw new Error(`Missing reference data in ${table}`);
  return rows[0].id;
};

const getLookups = async (conn) => ({
  tourTypeId: await getFirstId(conn, 'tourtype', 'tourTypeId'),
  destinationId: await getFirstId(conn, 'dropdowndestination', 'destinationId'),
  departureTypeId: await getFirstId(conn, 'dropdowndeparturetype', 'departureTypeId'),
  countryId: await getFirstId(conn, 'countries', 'countryId'),
  vehicleId: await getFirstId(conn, 'dropdownvehicle', 'vehicleId'),
  mealPlanId: await getFirstId(conn, 'dropdownmealplan', 'mealPlanId'),
  kitchenId: await getFirstId(conn, 'dropdownkitchen', 'kitchenId'),
  mealTypeId: await getFirstId(conn, 'dropdownmealtype', 'mealTypeId'),
  enquiryReferId: await getFirstId(conn, 'dropdownenquiryreference', 'enquiryReferId'),
  paymentModeId: await getFirstId(conn, 'dropdownpaymentmode', 'paymentModeId'),
});

const getUsers = async (conn) => {
  const [active] = await conn.query('SELECT userId, userName FROM users WHERE status = 1 ORDER BY userId LIMIT 3');
  if (active.length) return active;
  const [fallback] = await conn.query('SELECT userId, userName FROM users ORDER BY userId LIMIT 3');
  if (!fallback.length) throw new Error('No users found in users table');
  return fallback;
};

const ensureGroupTour = async (conn, lookup) => {
  const [existing] = await conn.query('SELECT groupTourId FROM grouptours WHERE tourCode = ?', [DEMO_TOUR_CODE]);
  if (existing.length) return existing[0].groupTourId;
  const startDate = moment().add(7, 'days').format('YYYY-MM-DD');
  const endDate = moment().add(12, 'days').format('YYYY-MM-DD');
  const [result] = await conn.query(
    `INSERT INTO grouptours (tourName, tourCode, tourTypeId, destinationId, departureTypeId, countryId, stateId, startDate, endDate, night, days, totalSeats, vehicleId, mealPlanId, kitchenId, mealTypeId, tourManager, managerNo, uniqueExperience, shopping, weather, bgImage, websiteBanner, websiteDescription, clientcode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Demo Himalayan Escape',
      DEMO_TOUR_CODE,
      lookup.tourTypeId,
      lookup.destinationId,
      lookup.departureTypeId,
      lookup.countryId,
      null,
      startDate,
      endDate,
      5,
      6,
      40,
      lookup.vehicleId,
      lookup.mealPlanId,
      lookup.kitchenId,
      lookup.mealTypeId,
      'Demo Manager',
      '9999999999',
      1,
      'Handpicked markets',
      'Pleasant',
      null,
      null,
      null,
      CLIENT_CODE,
    ]
  );
  return result.insertId;
};

const ensureUpcoming = async (conn, user, groupTourId, lookup, index) => {
  const guestId = `GT-DEMO-UPCOMING-${user.userId}`;
  const [existing] = await conn.query('SELECT enquiryGroupId FROM enquirygrouptours WHERE guestId = ?', [guestId]);
  if (existing.length) return existing[0].enquiryGroupId;
  const nextFollowUp = moment().add(index + 1, 'days').format('YYYY-MM-DD');
  const enquiryId = numericId();
  await conn.query(
    `INSERT INTO enquirygrouptours (groupTourId, guestId, enquiryReferId, enquiryId, groupName, firstName, lastName, contact, mail, adults, child, familyHeadNo, assignTo, guestRefId, nextFollowUp, nextFollowUpTime, remark, enquiryProcess, clientcode, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      groupTourId,
      guestId,
      lookup.enquiryReferId,
      enquiryId,
      'Demo Billing Group',
      `Upcoming ${user.userName || 'User'}`,
      'Lead',
      `91230000${user.userId}`,
      `upcoming${user.userId}@example.com`,
      2 + index,
      index,
      2000 + user.userId,
      user.userId,
      `REF-${guestId}`,
      nextFollowUp,
      '11:00',
      'Automated follow-up',
      1,
      CLIENT_CODE,
      user.userId,
    ]
  );
  return enquiryId;
};

const ensureFamilyHead = async (conn, enquiryGroupId, guestLabel, user) => {
  const [existing] = await conn.query('SELECT familyHeadGtId FROM grouptourfamilyheaddetails WHERE enquiryGroupId = ? LIMIT 1', [enquiryGroupId]);
  if (existing.length) return existing[0].familyHeadGtId;
  const [result] = await conn.query(
    `INSERT INTO grouptourfamilyheaddetails (enquiryGroupId, firstName, lastName, paxPerHead, guestId, clientcode)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      enquiryGroupId,
      'Demo Family Head',
      user.userName || 'User',
      4,
      `${guestLabel}-HEAD`,
      CLIENT_CODE,
    ]
  );
  return result.insertId;
};

const ensureDiscount = async (conn, details) => {
  const [existing] = await conn.query('SELECT groupDisId, grandTotal FROM grouptourdiscountdetails WHERE enquiryGroupId = ? LIMIT 1', [details.enquiryGroupId]);
  if (existing.length) return { groupDisId: existing[0].groupDisId, grandTotal: Number(existing[0].grandTotal) };
  const tourPrice = 250000;
  const additionalDis = 10000;
  const discountPrice = tourPrice - additionalDis;
  const gst = 11250;
  const tcs = 500;
  const grandTotal = discountPrice + gst + tcs;
  const [result] = await conn.query(
    `INSERT INTO grouptourdiscountdetails (tourPrice, enquiryGroupId, groupTourId, familyHeadGtId, additionalDis, points, discountPrice, gst, tcs, grandTotal, billingName, address, phoneNo, gstin, panNo, invoiceNo, invoiceUrl, isInvoiceSend, clientcode, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tourPrice,
      details.enquiryGroupId,
      details.groupTourId,
      details.familyHeadGtId,
      additionalDis,
      0,
      discountPrice,
      gst,
      tcs,
      grandTotal,
      'Demo Billing',
      'Demo Address',
      9123456789,
      'GSTDEMO1234',
      'PANDEMO1234',
      numericId(),
      null,
      0,
      CLIENT_CODE,
      details.createdBy,
    ]
  );
  return { groupDisId: result.insertId, grandTotal };
};

const ensurePayment = async (conn, details) => {
  const [existing] = await conn.query('SELECT groupPaymentDetailId FROM grouptourpaymentdetails WHERE enquiryGroupId = ? LIMIT 1', [details.enquiryGroupId]);
  if (existing.length) return existing[0].groupPaymentDetailId;
  const advancePayment = 100000;
  const balance = details.grandTotal - advancePayment;
  const paymentDate = moment().format('YYYY-MM-DD');
  const [result] = await conn.query(
    `INSERT INTO grouptourpaymentdetails (enquiryGroupId, groupDisId, groupTourId, familyHeadGtId, advancePayment, balance, paymentModeId, onlineTypeId, bankName, chequeNo, paymentDate, transactionId, transactionProof, createdBy, status, receiptNo, receiptUrl, isReceiptSend, clientcode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      details.enquiryGroupId,
      details.groupDisId,
      details.groupTourId,
      details.familyHeadGtId,
      advancePayment,
      balance,
      details.paymentModeId,
      null,
      'Demo Bank',
      null,
      paymentDate,
      `TXN-${numericId()}`,
      null,
      details.createdBy,
      0,
      `RCPT-${numericId()}`,
      null,
      1,
      CLIENT_CODE,
    ]
  );
  return result.insertId;
};

const ensurePayPending = async (conn, groupTourId, lookup, user) => {
  const [existing] = await conn.query('SELECT enquiryGroupId FROM enquirygrouptours WHERE guestId = ? LIMIT 1', [PAY_PENDING_GUEST]);
  let enquiryGroupId;
  if (existing.length) {
    enquiryGroupId = existing[0].enquiryGroupId;
  } else {
    const nextFollowUp = moment().add(2, 'days').format('YYYY-MM-DD');
    const enquiryId = numericId();
    const [result] = await conn.query(
      `INSERT INTO enquirygrouptours (groupTourId, guestId, enquiryReferId, enquiryId, groupName, firstName, lastName, contact, mail, adults, child, familyHeadNo, assignTo, guestRefId, nextFollowUp, nextFollowUpTime, remark, enquiryProcess, clientcode, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        groupTourId,
        PAY_PENDING_GUEST,
        lookup.enquiryReferId,
        enquiryId,
        'Demo Billing Group',
        'Pending Pay',
        'Guest',
        '9123000099',
        'pendingpay@example.com',
        4,
        1,
        3001,
        user.userId,
        `REF-${PAY_PENDING_GUEST}`,
        nextFollowUp,
        '10:00',
        'Awaiting payment',
        2,
        CLIENT_CODE,
        user.userId,
      ]
    );
    enquiryGroupId = result.insertId;
  }
  const familyHeadGtId = await ensureFamilyHead(conn, enquiryGroupId, PAY_PENDING_GUEST, user);
  const discount = await ensureDiscount(conn, {
    enquiryGroupId,
    groupTourId,
    familyHeadGtId,
    createdBy: user.userId,
  });
  const paymentId = await ensurePayment(conn, {
    enquiryGroupId,
    groupTourId,
    familyHeadGtId,
    groupDisId: discount.groupDisId,
    grandTotal: discount.grandTotal,
    paymentModeId: lookup.paymentModeId,
    createdBy: user.userId,
  });
  return { enquiryGroupId, groupDisId: discount.groupDisId, paymentId };
};

const run = async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const lookup = await getLookups(conn);
    const users = await getUsers(conn);
    const groupTourId = await ensureGroupTour(conn, lookup);
    for (let i = 0; i < users.length; i += 1) {
      await ensureUpcoming(conn, users[i], groupTourId, lookup, i);
    }
    const payPendingInfo = await ensurePayPending(conn, groupTourId, lookup, users[0]);
    await conn.commit();
    console.log('Seeded group tour:', groupTourId);
    console.log('Upcoming follow-ups prepared for users:', users.map((u) => u.userId));
    console.log('Pending payment enquiry:', payPendingInfo);
  } catch (err) {
    await conn.rollback();
    console.error('Seeding failed:', err.message);
    if (err.sql) console.error(err.sql);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
};

run();
