const express = require("express");
const router = express.Router();
const pool = require("../../db");
const db = require("../../db");
const { body, query, validationResult } = require("express-validator");
const CommonController = require("../controllers/CommonController");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Joi = require("joi");
// ---------------- MULTER CONFIG ----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// ---------------- ROUTE ----------------
router.post(
  "/receive-bill-ct",
  upload.single("transactionProof"),
  async (req, res) => {
    const {
      enquiryCustomId,
      enquiryDetailCustomId,
      advancePayment,
      paymentModeId,
      onlineTypeId,
      bankName,
      chequeNo,
      cardTypeId,
      payDate,
      transactionId,
    } = req.body;

    // File comes from multer
    const transactionProof = req.file ? req.file.filename : null;

    // Basic validation
    if (
      !enquiryCustomId ||
      !enquiryDetailCustomId ||
      !advancePayment ||
      !transactionProof ||
      !payDate
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (advancePayment <= 0) {
      return res
        .status(400)
        .json({ message: "Advance payment must be greater than 0" });
    }

    try {
      // check token
      const tokenData = await CommonController.checkToken(
        req.headers["token"],
        [155, 170, 247, 255]
      );
      if (tokenData.error) {
        return res.status(401).json({ message: tokenData.error });
      }

      // fetch discount details
      const [details] = await pool.query(
        `SELECT customDisId, grandTotal 
       FROM customtourdiscountdetails 
       WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ? 
       LIMIT 1`,
        [enquiryCustomId, enquiryDetailCustomId]
      );

      if (!details.length) {
        return res.status(404).json({ message: "Discount details not found" });
      }

      // get last balance
      const [balanceRow] = await pool.query(
        `SELECT balance FROM customtourpaymentdetails 
       WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ? 
       ORDER BY created_at DESC LIMIT 1`,
        [enquiryCustomId, enquiryDetailCustomId]
      );

      let existingBalance = details[0].grandTotal; // default: full grandTotal
      if (balanceRow.length > 0) {
        existingBalance = balanceRow[0].balance;
      }

      // calculate new balance
      const newBalance = existingBalance - advancePayment;
      if (newBalance < 0) {
        return res.status(400).json({
          message: "Total tour amount should be less than pending balance",
        });
      }

      // insert payment details
      await pool.query(
        `INSERT INTO customtourpaymentdetails 
        (enquiryCustomId, enquiryDetailCustomId, customDisId, advancePayment, balance, 
         paymentModeId, onlineTypeId, bankName, chequeNo, payDate, 
         transactionId, transactionProof, cardTypeId, createdBy, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          enquiryCustomId,
          enquiryDetailCustomId,
          details[0].customDisId,
          advancePayment,
          newBalance,
          paymentModeId || null,
          onlineTypeId || null,
          bankName || null,
          chequeNo || null,
          payDate,
          transactionId || null,
          transactionProof, // now filename saved
          cardTypeId || null,
          tokenData.userId,
        ]
      );

      return res.status(200).json({
        message: "New Payment added successfully",
        filePath: `/uploads/${transactionProof}`, // return file path
      });
    } catch (err) {
      console.error("Error in receiveBillCt:", err);
      return res.status(500).json({ message: err.message });
    }
  }
);
router.post("/sales/image-upload", upload.single("file"), (req, res) => {
  res.json({ message: "Uploaded successfully", file: req.file.filename });
});
// 📌 Route: GET /api/enqGroup-details?enquiryGroupId=1
router.get("/enqGroup-details", async (req, res) => {
  try {
    const token = req.headers["token"];

    // ✅ Token check
    const tokenData = await CommonController.checkToken(
      token,
      [26, 39, 157, 177, 205, 212, 214, 225, 227]
    );
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    const { enquiryGroupId } = req.query;

    // ✅ Validation
    if (!enquiryGroupId) {
      return res.status(400).json({ message: "enquiryGroupId is required" });
    }

    // ✅ Main Enquiry Details
    const [enqRows] = await pool.query(
      `
      SELECT 
        enq.*, 
        g.departureTypeId, g.vehicleId, g.destinationId, g.tourName, g.tourCode,
        ddep.departureName,
        dref.enquiryReferName,
        dp.preFixName
      FROM enquirygrouptours enq
      JOIN grouptours g ON enq.groupTourId = g.groupTourId
      LEFT JOIN dropdownprefix dp ON enq.preFixId = dp.preFixId
      JOIN dropdownenquiryreference dref ON enq.enquiryReferId = dref.enquiryReferId
      JOIN dropdowndeparturetype ddep ON g.departureTypeId = ddep.departureTypeId
      WHERE enq.enquiryGroupId = ?
      `,
      [enquiryGroupId]
    );

    if (!enqRows || enqRows.length === 0) {
      return res.status(404).json({ message: "Enquiry details not found" });
    }

    const enqDetails = enqRows[0];

    // ✅ Check Family Head exists
    const [familyRows] = await pool.query(
      "SELECT * FROM grouptourfamilyheaddetails WHERE enquiryGroupId = ? LIMIT 1",
      [enquiryGroupId]
    );
    const isEnqNonEditable = familyRows.length > 0;

    // ✅ User Data
    const [userRows] = await pool.query(
      "SELECT * FROM users WHERE guestId = ? LIMIT 1",
      [enqDetails.guestId]
    );
    const userData = userRows.length > 0 ? userRows[0] : null;

    let ref = null;
    if (enqDetails.guestRefId) {
      const [refRows] = await pool.query(
        "SELECT * FROM users WHERE guestId = ? LIMIT 1",
        [enqDetails.guestRefId]
      );
      ref = refRows.length > 0 ? refRows[0] : null;
    }

    // ✅ Final Response
    res.json({
      departureType: enqDetails.departureTypeId,
      departureName: enqDetails.departureName,
      modeOfTransport: enqDetails.vehicleId,
      preFixId: enqDetails.preFixId,
      preFixName: enqDetails.preFixName,
      firstName: enqDetails.firstName,
      fullName: `${enqDetails.firstName} ${enqDetails.lastName || ""}`,
      lastName: enqDetails.lastName || "",
      destinationId: enqDetails.destinationId,
      email: enqDetails.mail,
      guestType: enqDetails.enquiryReferName,
      contact: enqDetails.contact,
      groupTourId: enqDetails.groupTourId,
      enquiryReferId: enqDetails.enquiryReferId,
      priorityId: enqDetails.priorityId,
      tourName: enqDetails.tourName,
      tourCode: enqDetails.tourCode,
      adults: enqDetails.adults,
      child: enqDetails.child,
      guestRefId: enqDetails.guestRefId,
      guestId: enqDetails.guestId,
      groupName: enqDetails.groupName,
      familyHeadNo: enqDetails.familyHeadNo,
      assignTo: enqDetails.assignTo,
      userId: userData ? userData.userId : "",
      userName: userData ? userData.userName : "",
      gender: userData ? userData.gender || "" : "",
      dob: userData ? userData.dob || "" : "",
      marriageDate: userData ? userData.marriageDate : "",
      adharCard: userData ? userData.adharCard || "" : "",
      adharNo: userData ? userData.adharNo || "" : "",
      pan: userData ? userData.pan || "" : "",
      panNo: userData ? userData.panNo || "" : "",
      passport: userData ? userData.passport || "" : "",
      address: userData ? userData.address || "" : "",
      loyaltyPoints: userData ? userData.loyaltyPoints || 0 : 0,
      isEnquiryNonEditable: isEnqNonEditable,
    });
  } catch (err) {
    console.error("❌ enqGroupDetails Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});
// 📌 GET /api/familyHead-list-gt?enquiryGroupId=1
router.get("/familyHead-list-gt", async (req, res) => {
  try {
    const token = req.headers["token"];

    // ✅ Token check (optional, if required)
    // const tokenData = await CommonController.checkToken(token, []);
    // if (tokenData.error) {
    //   return res.status(401).json({ message: tokenData.message });
    // }

    const { enquiryGroupId } = req.query;
    if (!enquiryGroupId) {
      return res.status(400).json({ message: "enquiryGroupId is required" });
    }

    // ✅ Get enquiry details
    const [enqRows] = await pool.query(
      `
      SELECT e.*, g.destinationId
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      WHERE e.enquiryGroupId = ?
      `,
      [enquiryGroupId]
    );

    if (!enqRows || enqRows.length === 0) {
      return res.status(404).json({ message: "Enquiry Not Found" });
    }

    const enqDetails = enqRows[0];

    // ✅ Family Head Details
    const [familyRows] = await pool.query(
      `
      SELECT f.*, dp.preFixName
      FROM grouptourfamilyheaddetails f
      JOIN dropdownprefix dp ON f.preFixId = dp.preFixId
      WHERE f.enquiryGroupId = ?
      `,
      [enquiryGroupId]
    );

    if (!familyRows || familyRows.length === 0) {
      return res.json({ data: [] });
    }

    const familyData = [];

    for (const value of familyRows) {
      // ✅ User details
      const [userRows] = await pool.query(
        "SELECT * FROM users WHERE guestId = ? LIMIT 1",
        [value.guestId]
      );
      const userDetails = userRows.length > 0 ? userRows[0] : null;

      let loyaltyPoint = 0;
      if (userDetails) {
        // ✅ Loyalty points calculation (last 1 year)
        const [creditRows] = await pool.query(
          `
          SELECT SUM(loyaltyPoint) as total
          FROM loyaltypoints
          WHERE isType = 0 AND userId = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
          `,
          [userDetails.userId]
        );
        const [debitRows] = await pool.query(
          `
          SELECT SUM(loyaltyPoint) as total
          FROM loyaltypoints
          WHERE isType = 1 AND userId = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
          `,
          [userDetails.userId]
        );

        const creditedPoints = creditRows[0].total || 0;
        const debitedPoints = debitRows[0].total || 0;
        loyaltyPoint = creditedPoints - debitedPoints;
      }

      // ✅ Head data
      const [headRows] = await pool.query(
        "SELECT * FROM grouptourguestdetails WHERE familyHeadGtId = ? LIMIT 1",
        [value.familyHeadGtId]
      );
      const headData = headRows.length > 0 ? headRows[0] : null;

      // ✅ Build response
      familyData.push({
        familyHeadGtId: value.familyHeadGtId,
        preFixId: value.preFixId,
        preFixName: value.preFixName,
        firstName: value.firstName,
        middleName: value.middleName || "",
        lastName: value.lastName,
        status: value.status,
        address: headData ? headData.address : "",
        contact: headData ? headData.contact : "",
        paxPerHead: value.paxPerHead,
        guestId: value.guestId,
        loyaltyPoints: loyaltyPoint,
        destinationId: enqDetails.destinationId,
      });
    }

    res.json({ data: familyData });
  } catch (err) {
    console.error("❌ familyHead-list-gt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// 📌 Route: GET /api/family-head-data?enquiryGroupId=1&familyHeadGtId=10
router.get("/family-head-data", async (req, res) => {
  try {
    const token = req.headers["token"];

    // ✅ Token check
    const tokenData = await CommonController.checkToken(token, [144, 227]);
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    let { enquiryGroupId, familyHeadGtId } = req.query;

    if (!enquiryGroupId) {
      return res.status(400).json({ message: "enquiryGroupId is required" });
    }

    // ✅ Fetch enquiry details
    const [enqDetailsRows] = await pool.query(
      `SELECT enq.*, g.destinationId
       FROM enquirygrouptours enq
       JOIN grouptours g ON enq.groupTourId = g.groupTourId
       WHERE enq.enquiryGroupId = ?
       LIMIT 1`,
      [enquiryGroupId]
    );

    if (enqDetailsRows.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }
    const enqDetails = enqDetailsRows[0];

    // ✅ If familyHeadGtId not given, fetch the first family head
    if (!familyHeadGtId || familyHeadGtId === "undefined") {
      const [firstFamilyHead] = await pool.query(
        "SELECT familyHeadGtId FROM grouptourfamilyheaddetails WHERE enquiryGroupId = ? LIMIT 1",
        [enquiryGroupId]
      );
      if (firstFamilyHead.length === 0) {
        return res.status(404).json({ message: "Family Head not found" });
      }
      familyHeadGtId = firstFamilyHead[0].familyHeadGtId;
    }

    // ✅ Fetch family head details
    const [familyHeadRows] = await pool.query(
      `SELECT fh.*, dp.preFixName
       FROM grouptourfamilyheaddetails fh
       LEFT JOIN dropdownprefix dp ON fh.preFixId = dp.preFixId
       WHERE fh.familyHeadGtId = ? AND fh.enquiryGroupId = ?
       LIMIT 1`,
      [familyHeadGtId, enquiryGroupId]
    );

    if (familyHeadRows.length === 0) {
      return res.status(404).json({ message: "Family Head not found" });
    }
    const familyHead = familyHeadRows[0];

    // ✅ Loyalty points
    const [loyaltyRows] = await pool.query(
      "SELECT loyaltyPoints FROM users WHERE guestId = ? LIMIT 1",
      [familyHead.guestId]
    );
    const loyaltyPoints =
      loyaltyRows.length > 0 ? loyaltyRows[0].loyaltyPoints : 0;

    // ✅ Guest details
    const [guestRows] = await pool.query(
      "SELECT * FROM grouptourguestdetails WHERE familyHeadGtId = ? LIMIT 1",
      [familyHeadGtId]
    );
    const guest = guestRows.length > 0 ? guestRows[0] : {};

    // ✅ Build response object
    const data = {
      familyHeadGtId: familyHead.familyHeadGtId,
      preFixId: familyHead.preFixId,
      preFixName: familyHead.preFixName,
      firstName: familyHead.firstName,
      lastName: familyHead.lastName,
      address: guest.address || "",
      contact: guest.contact || "",
      paxPerHead: familyHead.paxPerHead,
      guestId: familyHead.guestId,
      loyaltyPoints,
      destinationId: enqDetails.destinationId,
    };

    res.json({ data });
  } catch (err) {
    console.error("❌ familyHeadData Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});
// 📌 Route: GET /api/total-call-count-gt?enquiryGroupId=1
router.get("/total-call-count-gt", async (req, res) => {
  try {
    const token = req.headers["token"];

    // ✅ Token check
    const tokenData = await CommonController.checkToken(
      token,
      [27, 204, 208, 213]
    );
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    const { enquiryGroupId } = req.query;

    // ✅ Validation
    if (!enquiryGroupId) {
      return res.status(400).json({ message: "enquiryGroupId is required" });
    }

    // ✅ Get groupName
    const [groupRows] = await pool.query(
      "SELECT groupName FROM enquirygrouptours WHERE enquiryGroupId = ? LIMIT 1",
      [enquiryGroupId]
    );
    const groupName = groupRows.length > 0 ? groupRows[0].groupName : null;

    // ✅ Count total calls
    const [callCountRows] = await pool.query(
      "SELECT COUNT(*) AS callCount FROM callfollowupgt WHERE enquiryGroupId = ?",
      [enquiryGroupId]
    );
    const callCount = callCountRows.length > 0 ? callCountRows[0].callCount : 0;

    res.json({
      callCount,
      groupName,
    });
  } catch (err) {
    console.error("❌ totalCallCountGt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// 📌 Route: GET /api/group-tour-completion-status?enquiryGroupId=1&familyHeadGtId=2
// ✅ Group Tour Completion Status
// router.get("/group-tour-completion-status", async (req, res) => {
//   try {
//     const { enquiryGroupId, familyHeadGtId } = req.query;

//     // Validate query params
//     if (!enquiryGroupId) {
//       return res.status(400).json({ message: "enquiryGroupId is required" });
//     }
//     if (!familyHeadGtId) {
//       return res.status(400).json({ message: "familyHeadGtId is required" });
//     }

//     // Check if enquiry exists
//     const [enqExists] = await pool.query(
//       "SELECT 1 FROM enquirygrouptours WHERE enquiryGroupId = ? AND enquiryProcess = 1 LIMIT 1",
//       [enquiryGroupId]
//     );

//     // Check follow-up exists
//     const [followUp] = await pool.query(
//       "SELECT 1 FROM callfollowupgt WHERE enquiryGroupId = ? LIMIT 1",
//       [enquiryGroupId]
//     );

//     // Check confirmation (no balance)
//     const [isConfirm] = await pool.query(
//       "SELECT 1 FROM confirm_group_tour WHERE enquiryGroupId = ? AND familyHeadGtId = ? LIMIT 1",
//       [enquiryGroupId, familyHeadGtId]
//     );

//     // Determine completion status
//     let completionStatusCount = 1; // default
//     // Remove isBooked logic since balance column doesn't exist
//     if (isConfirm.length > 0) completionStatusCount = 4;
//     else if (followUp.length > 0) completionStatusCount = 2;

//     res.status(200).json({ completionStatusCount });
//   } catch (error) {
//     console.error("groupTourCompletionStatus Error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });
// 📌 Route: GET /api/group-tour-completion-status?enquiryGroupId=1
router.get("/group-tour-completion-status", async (req, res) => {
  try {
    const { enquiryGroupId } = req.query;

    // Validate query params
    if (!enquiryGroupId) {
      return res.status(400).json({ message: "enquiryGroupId is required" });
    }

    // ✅ Check if enquiry exists & process started
    const [enqExists] = await pool.query(
      "SELECT 1 FROM enquirygrouptours WHERE enquiryGroupId = ? AND enquiryProcess = 1 LIMIT 1",
      [enquiryGroupId]
    );

    // ✅ Check if any follow-up exists
    const [followUp] = await pool.query(
      "SELECT 1 FROM callfollowupgt WHERE enquiryGroupId = ? LIMIT 1",
      [enquiryGroupId]
    );

    // ✅ Check if group tour confirmed
    const [isConfirm] = await pool.query(
      "SELECT 1 FROM confirm_group_tour WHERE enquiryGroupId = ? LIMIT 1",
      [enquiryGroupId]
    );

    // ✅ Determine completion status
    let completionStatusCount = 1; // default = enquiry created
    if (isConfirm.length > 0) {
      completionStatusCount = 4; // confirmed
    } else if (followUp.length > 0) {
      completionStatusCount = 2; // follow-up done
    } else if (enqExists.length > 0) {
      completionStatusCount = 1; // enquiry exists
    }

    res.status(200).json({ completionStatusCount });
  } catch (error) {
    console.error("❌ groupTourCompletionStatus Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/dropdown-call-status", async (req, res) => {
  try {
    // Fetch all call statuses
    const [callStatusRows] = await pool.query(
      "SELECT callStatusId, callStatusName FROM dropdowncallstatus"
    );

    // Convert to array of objects
    const callStatusArray = callStatusRows.map((row) => ({
      callStatusId: row.callStatusId,
      callStatusName: row.callStatusName,
    }));

    res.status(200).json({ data: callStatusArray });
  } catch (error) {
    console.error("dropdownCallStatus Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/call-follow-history-gt?enquiryGroupId=1&page=1&perPage=10
router.get("/call-follow-history-gt", async (req, res) => {
  try {
    const { enquiryGroupId, page = 1, perPage = 10 } = req.query;

    if (!enquiryGroupId) {
      return res.status(400).json({ message: "enquiryGroupId is required" });
    }

    // Count total records
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM callfollowupgt WHERE enquiryGroupId = ?",
      [enquiryGroupId]
    );

    // Calculate offset
    const offset = (page - 1) * perPage;

    // Fetch paginated data with call status
    const [rows] = await pool.query(
      `SELECT cf.*, ds.callStatusName 
       FROM callfollowupgt cf
       JOIN dropdowncallstatus ds ON cf.callStatusId = ds.callStatusId
       WHERE cf.enquiryGroupId = ?
       ORDER BY cf.created_at DESC
       LIMIT ? OFFSET ?`,
      [enquiryGroupId, parseInt(perPage), parseInt(offset)]
    );

    // Map results
    const data = rows.map((row) => ({
      callStatusName: row.callStatusName,
      callSummary: row.callSummary,
      nextFollowUpDate: row.nextFollowUpDate,
      nextFollowUpTime: row.nextFollowUpTime,
      currentFollowUpDate: dayjs(row.created_at).format("YYYY-MM-DD"),
      currentFollowUpTime: dayjs(row.created_at).format("HH:mm"),
    }));

    const lastPage = Math.ceil(total / perPage);
    const currentPage = parseInt(page);

    res.status(200).json({
      data,
      total,
      currentPage,
      perPage: parseInt(perPage),
      nextPageUrl:
        currentPage < lastPage
          ? `/api/call-follow-history-gt?enquiryGroupId=${enquiryGroupId}&page=${
              currentPage + 1
            }&perPage=${perPage}`
          : null,
      previousPageUrl:
        currentPage > 1
          ? `/api/call-follow-history-gt?enquiryGroupId=${enquiryGroupId}&page=${
              currentPage - 1
            }&perPage=${perPage}`
          : null,
      lastPage,
    });
  } catch (error) {
    console.error("callFollowHistoryGt Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
// POST /api/cancel-enquiry-group-tour
router.post("/cancel-enquiry-group-tour", async (req, res) => {
  try {
    const { enquiryGroupId, closureReason } = req.body;

    // ✅ Validation
    if (!enquiryGroupId || isNaN(enquiryGroupId)) {
      return res
        .status(400)
        .json({ message: "enquiryGroupId is required and must be a number" });
    }
    if (!closureReason) {
      return res.status(400).json({ message: "closureReason is required" });
    }

    const token = req.headers["token"];
    // Optional: check token if required
    // const tokenData = await CommonController.checkToken(token, [27, 29]);
    // if (tokenData.error) return res.status(401).json({ message: tokenData.message });

    // ✅ Soft cancel: Update enquiryProcess to 3 (cancelled)
    const [updateResult] = await pool.query(
      "UPDATE enquirygrouptours SET enquiryProcess = 3, closureReason = ? WHERE enquiryGroupId = ?",
      [closureReason, enquiryGroupId]
    );

    if (updateResult.affectedRows > 0) {
      // ✅ Update loyalty points if needed
      await pool.query(
        `UPDATE loyaltypoints 
         SET isType = 1, closureReason = ? 
         WHERE enquiryId = ? AND isGroupCustom = 1 AND isType = 0`,
        [closureReason, enquiryGroupId]
      );

      return res
        .status(200)
        .json({ message: "Enquiry cancelled successfully" });
    } else {
      return res
        .status(404)
        .json({ message: "Enquiry not found or already cancelled" });
    }
  } catch (error) {
    console.error("cancelEnquiryGroupTour Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
// GET /api/total-call-count-ct?enquiryCustomId=13
router.get("/total-call-count-ct", async (req, res) => {
  try {
    const { enquiryCustomId } = req.query;

    // ✅ Validation
    if (!enquiryCustomId) {
      return res.status(400).json({ message: "enquiryCustomId is required" });
    }

    // ✅ Get groupName from enquirycustomtours
    const [groupRows] = await pool.query(
      "SELECT groupName FROM enquirycustomtours WHERE enquiryCustomId = ? LIMIT 1",
      [enquiryCustomId]
    );
    const groupName = groupRows.length > 0 ? groupRows[0].groupName : null;

    // ✅ Count calls in callfollowupct
    const [callCountRows] = await pool.query(
      "SELECT COUNT(*) AS callCount FROM callfollowupct WHERE enquiryCustomId = ?",
      [enquiryCustomId]
    );
    const callCount = callCountRows.length > 0 ? callCountRows[0].callCount : 0;

    // ✅ Send response
    res.status(200).json({ callCount, groupName });
  } catch (err) {
    console.error("❌ totalCallCountCt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/custom-tour-completion-status?enquiryCustomId=13
router.get("/custom-tour-completion-status", async (req, res) => {
  try {
    const { enquiryCustomId } = req.query;

    // ✅ Validation
    if (!enquiryCustomId) {
      return res.status(400).json({ message: "enquiryCustomId is required" });
    }

    // ✅ Check if enquiry exists and is in process
    const [enqExistsRows] = await pool.query(
      "SELECT 1 FROM enquirycustomtours WHERE enquiryCustomId = ? AND enquiryProcess = 1 LIMIT 1",
      [enquiryCustomId]
    );
    const enqExists = enqExistsRows.length > 0;

    // ✅ Check if any follow-up exists
    const [followUpRows] = await pool.query(
      "SELECT 1 FROM callfollowupct WHERE enquiryCustomId = ? LIMIT 1",
      [enquiryCustomId]
    );
    const followUp = followUpRows.length > 0;

    // ✅ Check if enquiry is confirmed
    const [isConfirmRows] = await pool.query(
      "SELECT 1 FROM enquirycustomtours WHERE enquiryCustomId = ? AND enquiryProcess = 2 LIMIT 1",
      [enquiryCustomId]
    );
    const isConfirm = isConfirmRows.length > 0;

    // ✅ Get all enquiryDetailCustomIds
    const [detailRows] = await pool.query(
      "SELECT enquiryDetailCustomId FROM customtourenquirydetails WHERE enquiryCustomId = ?",
      [enquiryCustomId]
    );
    const enquiryDetailCustomIds = detailRows.map(
      (row) => row.enquiryDetailCustomId
    );

    // ✅ Check if all details are booked (balance = 0)
    let isBooked = false;
    if (enquiryDetailCustomIds.length > 0) {
      const [paymentRows] = await pool.query(
        `SELECT COUNT(*) AS bookedCount
         FROM customtourpaymentdetails
         WHERE enquiryCustomId = ? AND balance = 0 AND enquiryDetailCustomId IN (?)`,
        [enquiryCustomId, enquiryDetailCustomIds]
      );
      isBooked = paymentRows[0].bookedCount === enquiryDetailCustomIds.length;
    }

    // ✅ Determine completion status
    let completionStatusCount = 0;
    if (isBooked) completionStatusCount = 6;
    else if (isConfirm) completionStatusCount = 4;
    else if (followUp) completionStatusCount = 2;
    else if (enqExists) completionStatusCount = 1;

    res.status(200).json({ completionStatusCount });
  } catch (err) {
    console.error("❌ customTourCompletionStatus Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/get-enquiry-ct?enquiryCustomId=13
router.get("/get-enquiry-ct", async (req, res) => {
  try {
    const { enquiryCustomId } = req.query;

    // ✅ Validation
    if (!enquiryCustomId || isNaN(enquiryCustomId)) {
      return res.status(400).json({
        message: "enquiryCustomId is required and must be a number",
      });
    }

    // ✅ Fetch enquiry details with joins
    const [enqDetailsRows] = await pool.query(
      `SELECT enq.*, dprefix.preFixName, ddest.destinationName
       FROM enquirycustomtours enq
       JOIN dropdowndestination ddest ON enq.destinationId = ddest.destinationId
       JOIN dropdownenquiryreference dref ON enq.enquiryReferId = dref.enquiryReferId
       LEFT JOIN dropdownprefix dprefix ON enq.preFixId = dprefix.preFixId
       LEFT JOIN dropdownpriority dpriority ON enq.priorityId = dpriority.priorityId
       WHERE enq.enquiryCustomId = ?
       LIMIT 1`,
      [enquiryCustomId]
    );

    if (enqDetailsRows.length === 0) {
      return res.status(404).json({ message: "Enquiry details not found" });
    }

    const enqDetails = enqDetailsRows[0];

    // ✅ Check if family head exists (non-editable flag)
    const [familyheadRows] = await pool.query(
      "SELECT 1 FROM customtourenquirydetails WHERE enquiryCustomId = ? LIMIT 1",
      [enquiryCustomId]
    );
    const isEnqNonEditable = familyheadRows.length > 0;

    // ✅ Build response object
    const data = {
      groupName: enqDetails.groupName,
      preFixId: enqDetails.preFixId,
      preFixName: enqDetails.preFixName,
      fullName: `${enqDetails.firstName} ${enqDetails.lastName}`,
      firstName: enqDetails.firstName,
      lastName: enqDetails.lastName,
      destinationId: enqDetails.destinationId,
      destinationName: enqDetails.destinationName,
      contact: enqDetails.contact,
      startDate: enqDetails.startDate,
      endDate: enqDetails.endDate,
      countryId: enqDetails.countryId,
      stateId: enqDetails.stateId,
      cities: enqDetails.cities,
      nights: enqDetails.nights,
      days: enqDetails.days,
      nightsNo: enqDetails.nightsNo,
      hotelCatId: enqDetails.hotelCatId,
      adults: enqDetails.adults,
      child: enqDetails.child,
      age: enqDetails.age ? JSON.parse(enqDetails.age) : [],
      rooms: enqDetails.rooms,
      extraBed: enqDetails.extraBed,
      mealPlanId: enqDetails.mealPlanId,
      familyHeadNo: enqDetails.familyHeadNo,
      enquiryReferId: enqDetails.enquiryReferId,
      guestRefId: enqDetails.guestRefId,
      priorityId: enqDetails.priorityId,
      nextFollowUp: enqDetails.nextFollowUp,
      nextFollowUpTime: enqDetails.nextFollowUpTime,
      sectorId: enqDetails.sectorId,
      notes: enqDetails.notes,
      assignTo: enqDetails.assignTo,
      isEnqNonEditable,
    };

    res.status(200).json(data);
  } catch (err) {
    console.error("❌ getEnquiryCt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/call-follow-history-ct?enquiryCustomId=13&page=1&limit=10
router.get("/call-follow-history-ct", async (req, res) => {
  try {
    const { enquiryCustomId, page = 1, limit = 10 } = req.query;

    // ✅ Validation
    if (!enquiryCustomId || isNaN(enquiryCustomId)) {
      return res.status(400).json({
        message: "enquiryCustomId is required and must be a number",
      });
    }

    const offset = (page - 1) * limit;

    // ✅ Fetch call history with join
    const [callHistoryRows] = await pool.query(
      `SELECT cf.*, cs.callStatusName
       FROM callfollowupct cf
       JOIN dropdowncallstatus cs ON cf.callStatusId = cs.callStatusId
       WHERE cf.enquiryCustomId = ?
       ORDER BY cf.created_at DESC
       LIMIT ? OFFSET ?`,
      [enquiryCustomId, parseInt(limit), parseInt(offset)]
    );

    // ✅ Total count for pagination
    const [totalRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM callfollowupct WHERE enquiryCustomId = ?",
      [enquiryCustomId]
    );
    const total = totalRows[0].total;

    // ✅ Format response
    const callHistoryCtArray = callHistoryRows.map((value) => ({
      callStatusName: value.callStatusName,
      callSummary: value.callSummary,
      nextFollowUpDate: value.nextFollowUpDate,
      nextFollowUpTime: value.nextFollowUpTime,
      currentFollowUpDate: dayjs(value.created_at).format("YYYY-MM-DD"),
      currentFollowUpTime: dayjs(value.created_at).format("HH:mm"),
    }));

    // Pagination info
    const lastPage = Math.ceil(total / limit);
    const nextPageUrl =
      page < lastPage
        ? `/api/call-follow-history-ct?enquiryCustomId=${enquiryCustomId}&page=${
            parseInt(page) + 1
          }&limit=${limit}`
        : null;
    const previousPageUrl =
      page > 1
        ? `/api/call-follow-history-ct?enquiryCustomId=${enquiryCustomId}&page=${
            parseInt(page) - 1
          }&limit=${limit}`
        : null;

    res.status(200).json({
      data: callHistoryCtArray,
      total,
      currentPage: parseInt(page),
      perPage: parseInt(limit),
      nextPageUrl,
      previousPageUrl,
      lastPage,
    });
  } catch (err) {
    console.error("❌ callFollowHistoryCt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/familyHead-list-ct?enquiryCustomId=13
router.get("/familyHead-list-ct", async (req, res) => {
  try {
    const { enquiryCustomId } = req.query;

    // ✅ Validation
    if (!enquiryCustomId || isNaN(enquiryCustomId)) {
      return res.status(400).json({
        message: "enquiryCustomId is required and must be a number",
      });
    }

    // ✅ Fetch enquiry details
    const [enqDetailsRows] = await pool.query(
      "SELECT * FROM enquirycustomtours WHERE enquiryCustomId = ? LIMIT 1",
      [enquiryCustomId]
    );
    if (enqDetailsRows.length === 0) {
      return res.status(404).json({ message: "Enquiry Not Found" });
    }
    const enqDetails = enqDetailsRows[0];

    // ✅ Fetch family head details
    const [familyHeadRows] = await pool.query(
      `SELECT chd.*, dp.preFixName
       FROM customtourenquirydetails chd
       LEFT JOIN dropdownprefix dp ON chd.preFixId = dp.preFixId
       WHERE chd.enquiryCustomId = ?`,
      [enquiryCustomId]
    );

    const enqFamilyHeadArray = [];

    for (const value of familyHeadRows) {
      // Fetch user details for loyalty points
      const [userRows] = await pool.query(
        "SELECT * FROM users WHERE guestId = ? LIMIT 1",
        [value.guestId]
      );
      let loyaltyPoint = 0;
      if (userRows.length > 0) {
        const user = userRows[0];
        const oneYearAgo = dayjs()
          .subtract(1, "year")
          .format("YYYY-MM-DD HH:mm:ss");

        const [creditedRows] = await pool.query(
          `SELECT SUM(loyaltyPoint) AS total FROM loyaltypoints
           WHERE isType = 0 AND userId = ? AND created_at >= ?`,
          [user.userId, oneYearAgo]
        );
        const [debitedRows] = await pool.query(
          `SELECT SUM(loyaltyPoint) AS total FROM loyaltypoints
           WHERE isType = 1 AND userId = ? AND created_at >= ?`,
          [user.userId, oneYearAgo]
        );

        loyaltyPoint =
          (creditedRows[0].total || 0) - (debitedRows[0].total || 0);
      }

      // Fetch headData
      const [headDataRows] = await pool.query(
        "SELECT * FROM customtourguestdetails WHERE enquiryDetailCustomId = ? LIMIT 1",
        [value.enquiryDetailCustomId]
      );
      const headData = headDataRows.length > 0 ? headDataRows[0] : {};

      // Build object
      enqFamilyHeadArray.push({
        enquiryDetailCustomId: value.enquiryDetailCustomId,
        preFixId: value.preFixId,
        preFixName: value.preFixName,
        firstName: value.firstName,
        middleName: value.middleName,
        lastName: value.lastName,
        status: value.status,
        address: headData.address || "",
        contact: headData.contact || "",
        panNo: headData.panNo || "",
        paxPerHead: value.paxPerHead,
        guestId: value.guestId,
        loyaltyPoints: loyaltyPoint,
        destinationId: enqDetails.destinationId,
      });
    }

    res.status(200).json({ data: enqFamilyHeadArray });
  } catch (err) {
    console.error("❌ familyHeadListCt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/room-share-family-head-ct?enquiryDetailCustomId=6&enquiryCustomId=13
router.get("/room-share-family-head-ct", async (req, res) => {
  try {
    const { enquiryDetailCustomId, enquiryCustomId } = req.query;

    // ✅ Validation
    if (!enquiryDetailCustomId || !enquiryCustomId) {
      return res.status(400).json({
        message: "enquiryDetailCustomId and enquiryCustomId are required",
      });
    }

    // ✅ Fetch room share data
    const [roomShareRows] = await pool.query(
      `SELECT f.*, d.roomShareName
       FROM familyHeadCtRoomShare f
       JOIN dropdownroomsharingct d ON f.roomShareId = d.roomShareId
       WHERE f.enquiryDetailCustomId = ? AND f.enquiryCustomId = ?`,
      [enquiryDetailCustomId, enquiryCustomId]
    );

    // ✅ Check if rooms already added
    const [roomDataRows] = await pool.query(
      `SELECT 1 FROM familyHeadCtRoomShare 
       WHERE enquiryDetailCustomId = ? AND enquiryCustomId = ? LIMIT 1`,
      [enquiryDetailCustomId, enquiryCustomId]
    );
    const alreadyRoomsAdded = roomDataRows.length > 0;

    // ✅ Get all room share options
    const [allRoomShareRows] = await pool.query(
      "SELECT roomShareId, roomShareName FROM dropdownroomsharingct"
    );

    let roomShareDataArray = [];

    if (roomShareRows.length > 0) {
      // Use actual data
      roomShareDataArray = roomShareRows.map((value) => ({
        roomShareId: value.roomShareId,
        roomShareName: value.roomShareName,
        count: value.count,
      }));
    } else {
      // No room shares, return all with count 0
      roomShareDataArray = allRoomShareRows.map((value) => ({
        roomShareId: value.roomShareId,
        roomShareName: value.roomShareName,
        count: 0,
      }));
    }

    res.status(200).json({
      data: roomShareDataArray,
      alreadyRoomsAdded,
    });
  } catch (err) {
    console.error("❌ roomShareFamilyHeadCt Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

router.get("/dropdown-final-custom-packages", async (req, res) => {
  try {
    const { enquiryCustomId } = req.query;

    if (!enquiryCustomId) {
      return res.status(400).json({ message: "enquiryCustomId is required" });
    }

    // Fetch the package (final if exists, otherwise any)
    const [packageRows] = await pool.query(
      `SELECT * FROM packagescustomtour WHERE enquiryCustomId = ? ORDER BY isFinal DESC LIMIT 1`,
      [enquiryCustomId]
    );

    if (packageRows.length === 0) {
      return res.status(404).json({ message: "Enquiry details not found" });
    }

    const roomsPackages = packageRows[0];

    const dropDownValue = ["adult", "extraBed", "childWithout"];
    const dropdownData = dropDownValue.map((key) => ({
      value: roomsPackages[key] || 0,
      label: key,
    }));

    res.json({
      data: dropdownData,
      isFinal: roomsPackages.isFinal === 1,
    });
  } catch (err) {
    console.error("dropdownFinalCustomPackage Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

router.get("/get-guest-details-ct", async (req, res) => {
  try {
    const { enquiryCustomId, enquiryDetailCustomId } = req.query;

    // ✅ Validate required parameters
    if (!enquiryCustomId || !enquiryDetailCustomId) {
      return res.status(400).json({
        message: "enquiryCustomId and enquiryDetailCustomId are required",
      });
    }

    // ✅ Check if enquiry exists
    const [enqRows] = await pool.query(
      "SELECT * FROM enquirycustomtours WHERE enquiryCustomId = ? LIMIT 1",
      [enquiryCustomId]
    );

    if (enqRows.length === 0) {
      return res.status(404).json({ message: "Enquiry details not found" });
    }

    const enqDetails = enqRows[0];

    // ✅ Fetch guest details
    const [guestRows] = await pool.query(
      `SELECT g.*, dp.preFixName
       FROM customtourguestdetails g
       LEFT JOIN dropdownprefix dp ON g.preFixId = dp.preFixId
       WHERE g.enquiryCustomId = ? AND g.enquiryDetailCustomId = ?`,
      [enquiryCustomId, enquiryDetailCustomId]
    );

    let guestDataArray = [];
    if (guestRows.length > 0) {
      guestRows.forEach((value) => {
        guestDataArray.push({
          preFixId: value.preFixId,
          preFixName: value.preFixName,
          firstName: value.firstName,
          lastName: value.lastName,
          destinationId: enqDetails.destinationId,
          gender: value.gender,
          contact: value.contact,
          roomShareType: value.roomShareType,
          roomShareTypeLabel: value.roomShareTypeLabel,
          address: value.address,
          mailId: value.mailId,
          dob: value.dob,
          marriageDate: value.marriageDate,
          adharCard: value.adharCard,
          passport: value.passport,
          passportNo: value.passportNo,
          passport_issue_date: value.passport_issue_date,
          passport_expiry_date: value.passport_expiry_date,
          adharNo: value.adharNo,
          pan: value.pan,
          panNo: value.panNo,
          guestId: value.guestId,
        });
      });
    }

    res.json({ data: guestDataArray });
  } catch (error) {
    console.error("getGuestDetailsCt Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/get-tour-cost-ct
router.get("/get-tour-cost-ct", async (req, res) => {
  try {
    const { enquiryCustomId, enquiryDetailCustomId, guestId } = req.query;

    // Validation
    if (!enquiryCustomId || !enquiryDetailCustomId || !guestId) {
      return res.status(400).json({
        message:
          "enquiryCustomId, enquiryDetailCustomId, and guestId are required",
      });
    }

    // Fetch enquiry details
    const [enquiryDetails] = await pool.query(
      "SELECT * FROM enquirycustomtours WHERE enquiryCustomId = ?",
      [enquiryCustomId]
    );

    if (!enquiryDetails.length) {
      return res.status(404).json({ message: "Enquiry details not found" });
    }

    // Fetch tour discount details
    const [tourCostData] = await pool.query(
      "SELECT * FROM customtourdiscountdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?",
      [enquiryCustomId, enquiryDetailCustomId]
    );

    // Fetch coupon data
    const [couponData] = await pool.query(
      "SELECT * FROM couponusages WHERE guestId = ? AND enquiryId = ? AND isType = 2",
      [guestId, enquiryCustomId] // Changed from enquiryGroupId to enquiryCustomId
    );

    // Fetch user loyalty points
    let loyaltyPoint = 0;
    const [userDetails] = await pool.query(
      "SELECT * FROM users WHERE guestId = ?",
      [guestId]
    );
    if (userDetails.length) {
      const userId = userDetails[0].userId;
      const oneYearAgo = dayjs()
        .subtract(1, "year")
        .format("YYYY-MM-DD HH:mm:ss");

      const [[credited]] = await pool.query(
        "SELECT SUM(loyaltyPoint) as total FROM loyaltypoints WHERE isType = 0 AND userId = ? AND created_at >= ?",
        [userId, oneYearAgo]
      );
      const [[debited]] = await pool.query(
        "SELECT SUM(loyaltyPoint) as total FROM loyaltypoints WHERE isType = 1 AND userId = ? AND created_at >= ?",
        [userId, oneYearAgo]
      );

      loyaltyPoint = (credited.total || 0) - (debited.total || 0);
    }

    // Fetch room share types
    const [roomShareRows] = await pool.query(
      "SELECT roomShareType FROM customtourguestdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?",
      [enquiryCustomId, enquiryDetailCustomId]
    );
    const roomSharePrices = roomShareRows.map(
      (r) => Number(r.roomShareType) || 0
    );
    const tourPrice = roomSharePrices.reduce((a, b) => a + b, 0);

    const isTourCostSubmitted = tourCostData.length > 0;

    // Prepare response object
    const responseObj = {};
    if (tourCostData.length) {
      const tour = tourCostData[0];
      responseObj.tourPrice = tour.tourPrice;
      responseObj.couponId = couponData.length ? couponData[0].couponId : "";
      responseObj.discountValue = couponData.length
        ? couponData[0].discountValue
        : "";
      responseObj.points = tour.points;
      responseObj.additionalDis = tour.additionalDis;
      responseObj.discountPrice = tour.discountPrice;
      responseObj.gst = tour.gst;
      responseObj.tcs = tour.tcs;
      responseObj.grandTotal = tour.grandTotal;
      responseObj.loyaltyPoints = loyaltyPoint;
      responseObj.isTourCostSubmitted = isTourCostSubmitted;
    } else {
      responseObj.tourPrice = tourPrice;
      responseObj.isTourCostSubmitted = isTourCostSubmitted;
      responseObj.loyaltyPoints = loyaltyPoint;
    }

    return res.status(200).json({ data: responseObj });
  } catch (error) {
    console.error("GetTourCostCalculationCt Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/get-tour-cost-ct
router.get("/get-tour-cost-ct", async (req, res) => {
  try {
    const { enquiryCustomId, enquiryDetailCustomId, guestId } = req.query;

    // Validation
    if (!enquiryCustomId || !enquiryDetailCustomId || !guestId) {
      return res.status(400).json({
        message:
          "enquiryCustomId, enquiryDetailCustomId, and guestId are required",
      });
    }

    // Fetch enquiry details
    const [enquiryDetails] = await pool.query(
      "SELECT * FROM enquirycustomtours WHERE enquiryCustomId = ?",
      [enquiryCustomId]
    );

    if (!enquiryDetails.length) {
      return res.status(404).json({ message: "Enquiry details not found" });
    }

    // Fetch tour discount details
    const [tourCostData] = await pool.query(
      "SELECT * FROM customtourdiscountdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?",
      [enquiryCustomId, enquiryDetailCustomId]
    );

    // Fetch coupon data
    const [couponData] = await pool.query(
      "SELECT * FROM couponusages WHERE guestId = ? AND enquiryId = ? AND isType = 2",
      [guestId, enquiryCustomId] // Changed from enquiryGroupId to enquiryCustomId
    );

    // Fetch user loyalty points
    let loyaltyPoint = 0;
    const [userDetails] = await pool.query(
      "SELECT * FROM users WHERE guestId = ?",
      [guestId]
    );
    if (userDetails.length) {
      const userId = userDetails[0].userId;
      const oneYearAgo = dayjs()
        .subtract(1, "year")
        .format("YYYY-MM-DD HH:mm:ss");

      const [[credited]] = await pool.query(
        "SELECT SUM(loyaltyPoint) as total FROM loyaltypoints WHERE isType = 0 AND userId = ? AND created_at >= ?",
        [userId, oneYearAgo]
      );
      const [[debited]] = await pool.query(
        "SELECT SUM(loyaltyPoint) as total FROM loyaltypoints WHERE isType = 1 AND userId = ? AND created_at >= ?",
        [userId, oneYearAgo]
      );

      loyaltyPoint = (credited.total || 0) - (debited.total || 0);
    }

    // Fetch room share types
    const [roomShareRows] = await pool.query(
      "SELECT roomShareType FROM customtourguestdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?",
      [enquiryCustomId, enquiryDetailCustomId]
    );
    const roomSharePrices = roomShareRows.map(
      (r) => Number(r.roomShareType) || 0
    );
    const tourPrice = roomSharePrices.reduce((a, b) => a + b, 0);

    const isTourCostSubmitted = tourCostData.length > 0;

    // Prepare response object
    const responseObj = {};
    if (tourCostData.length) {
      const tour = tourCostData[0];
      responseObj.tourPrice = tour.tourPrice;
      responseObj.couponId = couponData.length ? couponData[0].couponId : "";
      responseObj.discountValue = couponData.length
        ? couponData[0].discountValue
        : "";
      responseObj.points = tour.points;
      responseObj.additionalDis = tour.additionalDis;
      responseObj.discountPrice = tour.discountPrice;
      responseObj.gst = tour.gst;
      responseObj.tcs = tour.tcs;
      responseObj.grandTotal = tour.grandTotal;
      responseObj.loyaltyPoints = loyaltyPoint;
      responseObj.isTourCostSubmitted = isTourCostSubmitted;
    } else {
      responseObj.tourPrice = tourPrice;
      responseObj.isTourCostSubmitted = isTourCostSubmitted;
      responseObj.loyaltyPoints = loyaltyPoint;
    }

    return res.status(200).json({ data: responseObj });
  } catch (error) {
    console.error("GetTourCostCalculationCt Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/get-coupon-uses-ct
router.get("/get-coupon-uses-ct", async (req, res) => {
  try {
    const { guestId, enquiryCustomId } = req.query;

    // Validation
    if (!guestId || !enquiryCustomId) {
      return res
        .status(400)
        .json({ message: "guestId and enquiryCustomId are required" });
    }

    // Fetch coupon usage
    const [couponRows] = await pool.query(
      `SELECT cu.discountValue, cu.couponId, c.couponName, c.discountType, cu.isType, c.maxDiscount
       FROM couponusages cu
       JOIN coupons c ON cu.couponId = c.couponId
       WHERE cu.guestId = ? AND cu.enquiryId = ? AND cu.isType = 2
       LIMIT 1`,
      [guestId, enquiryCustomId]
    );

    const myObj = {};

    if (couponRows.length) {
      const coupon = couponRows[0];
      myObj.discountValue = coupon.discountValue;
      myObj.couponId = coupon.couponId;
      myObj.couponName = coupon.couponName;
      myObj.discountType = coupon.discountType;
      myObj.discountTypeDesc = "1-fixed amount, 2-percentage";
      myObj.maxDiscount = coupon.maxDiscount;
      myObj.isType = coupon.isType;
      myObj.isTypeDesc = "1-all, 2-new";
    }

    return res.status(200).json({ data: myObj });
  } catch (error) {
    console.error("GetCouponUsesCt Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/exists-user
router.get("/exists-user", async (req, res) => {
  try {
    const { guestId } = req.query;

    // Validation
    if (!guestId) {
      return res.status(422).json({ message: "guestId is required" });
    }

    // Check if user exists
    const [rows] = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM users WHERE guestId = ?) AS isExist",
      [guestId]
    );

    return res.status(200).json({ isExist: rows[0].isExist === 1 });
  } catch (error) {
    console.error("existsUser Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/payment-mode-list
router.get("/payment-mode-list", async (req, res) => {
  try {
    // Fetch payment modes
    const [rows] = await pool.query(
      "SELECT paymentModeId, paymentModeName FROM dropdownpaymentmode"
    );

    let payModeArray = [];

    if (rows.length > 0) {
      rows.forEach((value) => {
        payModeArray.push({
          paymentModeId: value.paymentModeId,
          paymentModeName: value.paymentModeName,
        });
      });
    }

    return res.status(200).json({ data: payModeArray });
  } catch (error) {
    console.error("paymentModeList Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/get-payment-calculation-ct", async (req, res) => {
  const { enquiryCustomId, enquiryDetailCustomId } = req.query;

  // Validate request
  if (!enquiryCustomId || !enquiryDetailCustomId) {
    return res.status(400).json({
      message: "enquiryCustomId and enquiryDetailCustomId are required",
    });
  }

  try {
    // Fetch payment details
    const [paymentDataRows] = await pool.query(
      `SELECT * FROM customtourpaymentdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?`,
      [enquiryCustomId, enquiryDetailCustomId]
    );
    const paymentData = paymentDataRows[0] || null;

    // Fetch billing details
    const [billingDataRows] = await pool.query(
      `SELECT * FROM customtourdiscountdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?`,
      [enquiryCustomId, enquiryDetailCustomId]
    );
    const billingData = billingDataRows[0] || null;

    // Fetch family head / guest details
    const [familyHeadRows] = await pool.query(
      `SELECT * FROM customtourguestdetails WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?`,
      [enquiryCustomId, enquiryDetailCustomId]
    );
    const familyHeadData = familyHeadRows[0] || null;

    // Prepare response object
    const myObj = {};

    if (paymentData) {
      myObj.advancePayment = paymentData.advancePayment;
      myObj.sameAsbillingName = familyHeadData
        ? `${familyHeadData.firstName} ${familyHeadData.lastName}`
        : "";
      myObj.sameAsphoneNo = familyHeadData ? familyHeadData.contact : "";
      myObj.sameAsaddress = familyHeadData ? familyHeadData.address : "";
      myObj.paymentModeId = paymentData.paymentModeId || "";
      myObj.onlineTypeId = paymentData.onlineTypeId || "";
      myObj.bankName = paymentData.bankName || "";
      myObj.chequeNo = paymentData.chequeNo || "";
      myObj.payDate = paymentData.payDate || "";
      myObj.transactionId = paymentData.transactionId || "";
      myObj.transactionProof = paymentData.transactionProof || "";
      myObj.cardTypeId = paymentData.cardTypeId || "";
      myObj.grandTotal = billingData ? billingData.grandTotal : "";
      myObj.billingName = billingData ? billingData.billingName : "";
      myObj.address = billingData ? billingData.address : "";
      myObj.phoneNo = billingData ? billingData.phoneNo : "";
      myObj.gstIn = billingData ? billingData.gstIn : "";
      myObj.panNo = billingData ? billingData.panNo : "";
    } else {
      myObj.grandTotal = billingData ? billingData.grandTotal : 0;
      myObj.advancePayment = 0;
      myObj.sameAsbillingName = familyHeadData
        ? `${familyHeadData.firstName} ${familyHeadData.lastName}`
        : "";
      myObj.sameAsphoneNo = familyHeadData ? familyHeadData.contact : "";
      myObj.sameAsaddress = familyHeadData ? familyHeadData.address : "";
      myObj.sameAsPanNo = familyHeadData ? familyHeadData.panNo : "";
    }

    return res.status(200).json({ data: myObj });
  } catch (error) {
    console.error("getPaymentCalculationCt Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/online-type-list", async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM dropdownonlinetype`);

    let onlineTypeArray = [];

    if (rows.length > 0) {
      rows.forEach((row) => {
        onlineTypeArray.push({
          onlineTypeId: row.onlineTypeId,
          onlineTypeName: row.onlineTypeName,
        });
      });
    }

    return res.status(200).json({ data: onlineTypeArray });
  } catch (error) {
    console.error("onlineTypeList Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/card-type-list", async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM dropdowncardtype`);

    let cardsArray = [];

    if (rows.length > 0) {
      rows.forEach((card) => {
        cardsArray.push({
          cardTypeId: card.cardTypeId,
          cardTypeName: card.cardTypeName,
        });
      });
    }

    return res.status(200).json({ data: cardsArray });
  } catch (error) {
    console.error("cardTypeList Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get(
  "/view-bill-ct",
  [
    query("enquiryDetailCustomId")
      .isNumeric()
      .withMessage("enquiryDetailCustomId is required and should be numeric"),
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ message: errors.array().map((e) => e.msg) });
      }

      const { enquiryDetailCustomId } = req.query;

      // Fetch customer + discount details
      const [customerDetailRows] = await pool.query(
        `
            SELECT cd.*, ctd.grandTotal, ctd.billingName, ctd.address AS billingAddress, 
                   ctd.phoneNo AS billingPhoneNo, ctd.gstIn, ctd.panNo
            FROM customtourenquirydetails cd
            JOIN customtourdiscountdetails ctd
              ON cd.enquiryDetailCustomId = ctd.enquiryDetailCustomId
            WHERE cd.status = 1 AND cd.enquiryDetailCustomId = ?
            LIMIT 1
        `,
        [enquiryDetailCustomId]
      );

      if (!customerDetailRows.length) {
        return res
          .status(200)
          .json({ message: "You have not filled the details" });
      }

      const customerDetail = customerDetailRows[0];

      // Fetch payment details
      const [paymentRows] = await pool.query(
        `
            SELECT * FROM customtourpaymentdetails 
            WHERE enquiryDetailCustomId = ?
        `,
        [enquiryDetailCustomId]
      );

      const advancePaymentSum = paymentRows.reduce(
        (sum, p) => sum + parseFloat(p.advancePayment || 0),
        0
      );
      const isBalance = customerDetail.grandTotal <= advancePaymentSum;

      const advancePayments = paymentRows.map((p) => ({
        customPayDetailId: p.customPayDetailId,
        advancePayment: p.advancePayment,
        status: p.status,
        statusDescription: "0-pending,1-confirm",
        receiptNo: p.receiptNo ? `RN${p.receiptNo}` : "",
      }));

      const paymentDetails = {
        enquiryCustomId: customerDetail.enquiryCustomId,
        enquiryDetailCustomId: customerDetail.enquiryDetailCustomId,
        billingName: customerDetail.billingName,
        address: customerDetail.billingAddress,
        phoneNumber: customerDetail.billingPhoneNo,
        gstIn: customerDetail.gstIn,
        panNumber: customerDetail.panNo,
        grandTotal: customerDetail.grandTotal,
        advancePayments: advancePayments,
        balance: paymentRows.length
          ? paymentRows[paymentRows.length - 1].balance
          : 0,
        isPaymentDone: isBalance,
      };

      return res.status(200).json({ data: paymentDetails });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.get(
  "/view-payment-bill-ct",
  [
    query("enquiryDetailCustomId")
      .notEmpty()
      .withMessage("enquiryDetailCustomId is required"),
    query("enquiryCustomId")
      .notEmpty()
      .withMessage("enquiryCustomId is required"),
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ message: errors.array().map((e) => e.msg) });
      }

      const { enquiryDetailCustomId, enquiryCustomId } = req.query;

      // Get grandTotal from customtourdiscountdetails
      const [payBalanceRows] = await pool.query(
        `SELECT grandTotal FROM customtourdiscountdetails 
             WHERE enquiryDetailCustomId = ? AND enquiryCustomId = ? 
             LIMIT 1`,
        [enquiryDetailCustomId, enquiryCustomId]
      );

      if (!payBalanceRows.length) {
        return res
          .status(404)
          .json({ message: "You have not filled the details" });
      }

      const grandTotal = parseFloat(payBalanceRows[0].grandTotal) || 0;

      // Get advance payments from customtourpaymentdetails
      const [advancePayRows] = await pool.query(
        `SELECT advancePayment FROM customtourpaymentdetails
             WHERE enquiryDetailCustomId = ? AND enquiryCustomId = ?`,
        [enquiryDetailCustomId, enquiryCustomId]
      );

      const advancePayment = advancePayRows.reduce(
        (sum, p) => sum + parseFloat(p.advancePayment || 0),
        0
      );
      const balance = grandTotal - advancePayment;

      const payBalanceArray = [
        {
          grandTotal,
          advancePayment,
          balance,
        },
      ];

      return res.status(200).json({ data: payBalanceArray });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

// GET /api/guests-document-ct?enquiryDetailCustomId=6&perPage=10&page=1
router.get("/guests-document-ct", async (req, res) => {
  const { enquiryDetailCustomId, perPage = 10, page = 1 } = req.query;

  // ✅ Token check
  try {
    const tokenData = await CommonController.checkToken(
      req.headers["token"],
      [156, 171, 248, 256, 267]
    );
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.error });
    }
  } catch (err) {
    return res.status(500).json({ message: "Token validation failed" });
  }

  // ✅ Validation
  if (!enquiryDetailCustomId) {
    return res
      .status(400)
      .json({ message: "enquiryDetailCustomId is required" });
  }

  try {
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;

    // Fetch paginated guest documents
    const [guestDocuments] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS 
          firstName, lastName, adharNo, adharCard, 
          pan, panNo, passport, passportNo, 
          passport_issue_date, passport_expiry_date 
       FROM customtourguestdetails 
       WHERE enquiryDetailCustomId = ? 
       LIMIT ? OFFSET ?`,
      [enquiryDetailCustomId, limit, offset]
    );

    // Get total count for pagination
    const [countResult] = await pool.query(`SELECT FOUND_ROWS() as total`);
    const total = countResult[0].total;

    // Map documents
    const guestDocumentsArray = guestDocuments.map((value) => ({
      familyHeadName: `${value.firstName} ${value.lastName}`,
      adharNo: value.adharNo,
      adharCard: value.adharCard,
      pan: value.pan,
      panNo: value.panNo,
      passport: value.passport,
      passportNo: value.passportNo,
      passport_issue_date: value.passport_issue_date,
      passport_expiry_date: value.passport_expiry_date,
    }));

    // Build pagination info
    const lastPage = Math.ceil(total / limit);
    const nextPageUrl =
      page < lastPage
        ? `/api/guests-document-ct?enquiryDetailCustomId=${enquiryDetailCustomId}&perPage=${limit}&page=${
            parseInt(page) + 1
          }`
        : null;
    const previousPageUrl =
      page > 1
        ? `/api/guests-document-ct?enquiryDetailCustomId=${enquiryDetailCustomId}&perPage=${limit}&page=${
            parseInt(page) - 1
          }`
        : null;

    return res.status(200).json({
      data: guestDocumentsArray,
      total,
      currentPage: parseInt(page),
      perPage: limit,
      nextPageUrl,
      previousPageUrl,
      lastPage,
    });
  } catch (err) {
    console.error("Error fetching guest documents:", err);
    return res.status(500).json({ message: err.message });
  }
});

// GET: guestsListCustomTour
router.get("/guests-list-custom-tour", async (req, res) => {
  try {
    const { enquiryCustomId, enquiryDetailCustomId } = req.query;

    // validation
    if (
      !enquiryCustomId ||
      isNaN(enquiryCustomId) ||
      !enquiryDetailCustomId ||
      isNaN(enquiryDetailCustomId)
    ) {
      return res
        .status(400)
        .json({ message: "Missing or invalid required fields" });
    }

    // fetch data from DB
    const [rows] = await pool.query(
      `SELECT customGuestDetailsId, preFixId, firstName, lastName, isCancel, guestId 
       FROM customtourguestdetails 
       WHERE enquiryCustomId = ? AND enquiryDetailCustomId = ?`,
      [enquiryCustomId, enquiryDetailCustomId]
    );

    // if no data
    if (!rows.length) {
      return res.json({ data: [] });
    }

    // build response
    const guestsDetailsArray = rows.map((row) => ({
      customGuestDetailsId: row.customGuestDetailsId,
      preFixId: row.preFixId,
      firstName: row.firstName,
      lastName: row.lastName,
      isCancel: row.isCancel,
      isCancelDescription: "1-cancel, 0-confirm(not cancel)",
      guestId: row.guestId,
    }));

    res.status(200).json({ data: guestsDetailsArray });
  } catch (err) {
    console.error("Error in guestsListCustomTour:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ------------------ Get Cancellation Process Data (CT) ------------------
router.get("/get-cancellation-process-data-ct", async (req, res) => {
  try {
    const { enquiryCustomId, enquiryDetailCustomId } = req.query;

    // Token check
    const tokenData = await CommonController.checkToken(
      req.headers.token,
      [173, 176, 191, 194, 258, 269, 277, 278]
    );
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    // Validation
    if (!enquiryCustomId || !enquiryDetailCustomId) {
      return res.status(400).json({
        message: "enquiryCustomId and enquiryDetailCustomId are required",
      });
    }

    // ✅ Corrected SQL
    const [guestDetails] = await pool.query(
      `SELECT c.customGuestDetailsId, g.firstName, g.lastName, 
              c.cancellationReason, c.cancellationCharges, c.refundAmount, 
              c.cancelType, c.accountName, c.accountNo, c.bank, c.branch, 
              c.ifsc, c.refundProof, c.creditNote, c.status
       FROM cancelrefundct c
       JOIN customtourguestdetails g 
         ON c.customGuestDetailsId = g.customGuestDetailsId
       WHERE c.enquiryCustomId = ? AND c.enquiryDetailCustomId = ?`,
      [enquiryCustomId, enquiryDetailCustomId]
    );

    const guestsDetailsArray = guestDetails.map((value) => ({
      customGuestDetailsId: value.customGuestDetailsId,
      name: `${value.firstName} ${value.lastName}`,
      cancellationReason: value.cancellationReason,
      cancellationCharges: value.cancellationCharges,
      refundAmount: value.refundAmount,
      cancelType: value.cancelType,
      cancelTypeDescription: "1-Process Refund, 2-Credit Note",
      accountName: value.accountName,
      accountNo: value.accountNo,
      bank: value.bank,
      branch: value.branch,
      ifsc: value.ifsc,
      refundProof: value.refundProof,
      creditNote: value.creditNote,
      status: value.status,
      statusDesc: "0-pending , 1- confirm",
    }));

    return res.status(200).json({ data: guestsDetailsArray });
  } catch (err) {
    console.error("Error in /get-cancellation-process-data-ct:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
// routes/EnquiriesRoutes.js

// GET /api/view-vouchers
router.get("/view-vouchers", async (req, res) => {
  try {
    // 🔹 1. Check token
    const token = req.header("token");
    const tokenData = await CommonController.checkToken(
      token,
      [283, 285, 287, 289]
    );
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.error });
    }

    // 🔹 2. Validate input
    const { enquiryCustomId, perPage = 10, page = 1 } = req.query;
    if (!enquiryCustomId) {
      return res.status(422).json({ error: "enquiryCustomId is required" });
    }

    const offset = (page - 1) * perPage;

    // 🔹 3. Query vouchers with pagination
    const [voucherList] = await pool.query(
      `SELECT v.voucherTypeId, v.vouchers, d.voucherName
       FROM vouchersct v
       JOIN dropdownvouchersname d 
         ON v.voucherTypeId = d.voucherTypeId
       WHERE v.enquiryCustomId = ?
       LIMIT ? OFFSET ?`,
      [enquiryCustomId, parseInt(perPage), parseInt(offset)]
    );

    // 🔹 4. Count total for pagination metadata
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total 
       FROM vouchersct 
       WHERE enquiryCustomId = ?`,
      [enquiryCustomId]
    );
    const total = countResult[0].total;

    // 🔹 5. Format response
    let voucherListArray = [];
    voucherList.forEach((value) => {
      voucherListArray.push({
        voucherName: value.voucherName,
        vouchers: value.vouchers,
      });
    });

    return res.status(200).json({
      data: voucherListArray,
      total: total,
      currentPage: parseInt(page),
      perPage: parseInt(perPage),
      nextPageUrl:
        offset + parseInt(perPage) < total
          ? `/api/view-vouchers?enquiryCustomId=${enquiryCustomId}&perPage=${perPage}&page=${
              parseInt(page) + 1
            }`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/view-vouchers?enquiryCustomId=${enquiryCustomId}&perPage=${perPage}&page=${
              parseInt(page) - 1
            }`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("Error in /view-vouchers:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// routes/EnquiriesRoutes.js

// GET /api/dropdown-vouchers-name
router.get("/dropdown-vouchers-name", async (req, res) => {
  try {
    // 🔹 1. Fetch data from DB
    const [vouchersName] = await pool.query(
      "SELECT voucherTypeId, voucherName FROM dropdownvouchersname"
    );

    // 🔹 2. Format data
    let vouchersNameArray = [];
    vouchersName.forEach((value) => {
      vouchersNameArray.push({
        voucherTypeId: value.voucherTypeId,
        voucherName: value.voucherName,
      });
    });

    // 🔹 3. Send response
    return res.status(200).json({
      data: vouchersNameArray,
    });
  } catch (error) {
    console.error("Error in /dropdown-vouchers-name:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// routes/EnquiriesRoutes.js

// ✅ view payment bill gt
router.get("/view-payment-bill-gt", async (req, res) => {
  try {
    const { familyHeadGtId, enquiryGroupId } = req.query;

    // 🔹 Validation
    if (!familyHeadGtId || !enquiryGroupId) {
      return res
        .status(400)
        .json({ message: "familyHeadGtId and enquiryGroupId are required" });
    }

    // 🔹 Token validation
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(
      token,
      [145, 159, 208, 216, 229]
    );
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.error });
    }

    // 🔹 Fetch grandTotal
    const [payBalance] = await pool.query(
      "SELECT grandTotal FROM grouptourdiscountdetails WHERE familyHeadGtId = ? AND enquiryGroupId = ? LIMIT 1",
      [familyHeadGtId, enquiryGroupId]
    );

    if (payBalance.length === 0) {
      return res
        .status(404)
        .json({ message: "You have not paid for this familyhead tour" });
    }

    // 🔹 Fetch advance payments
    const [advancePay] = await pool.query(
      "SELECT advancePayment FROM grouptourpaymentdetails WHERE familyHeadGtId = ? AND enquiryGroupId = ? ORDER BY created_at DESC",
      [familyHeadGtId, enquiryGroupId]
    );

    let advancePaymentTotal = 0;
    advancePay.forEach((row) => {
      advancePaymentTotal += row.advancePayment
        ? parseFloat(row.advancePayment)
        : 0;
    });

    // 🔹 Calculate balance
    const myObj = {
      grandTotal: payBalance[0].grandTotal,
      advancePayment: advancePaymentTotal,
      balance: payBalance[0].grandTotal - advancePaymentTotal,
    };

    return res.status(200).json({ data: [myObj] });
  } catch (error) {
    console.error("Error in /view-payment-bill-gt:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// Route: GET /api/dropdownRoomPrice

// GET /api/dropdownRoomPrice?enquiryGroupId=1
router.get(
  "/dropdownRoomPrice",
  query("enquiryGroupId")
    .isInt()
    .withMessage("enquiryGroupId is required and must be numeric"),
  async (req, res) => {
    // Validate query
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ message: errors.array().map((err) => err.msg) });
    }

    const enquiryGroupId = parseInt(req.query.enquiryGroupId);

    try {
      // Fetch enquiry group details
      const [enqDetails] = await pool.query(
        "SELECT enquiryGroupId, groupTourId FROM enquirygrouptours WHERE enquiryGroupId = ?",
        [enquiryGroupId]
      );

      if (enqDetails.length === 0) {
        // Fetch all existing enquiryGroupIds for debugging
        const [allIds] = await pool.query(
          "SELECT enquiryGroupId FROM enquirygrouptours"
        );
        const availableIds = allIds.map((row) => row.enquiryGroupId);
        return res.status(404).json({
          message: `Enquiry detail not found for enquiryGroupId = ${enquiryGroupId}`,
          availableEnquiryGroupIds: availableIds,
        });
      }

      const groupTourId = enqDetails[0].groupTourId;

      // Fetch room prices
      const [roomPrice] = await pool.query(
        `SELECT g.grouppricediscountId, g.roomShareId, g.tourPrice, g.offerPrice, d.roomShareName
         FROM grouptourpricediscount g
         JOIN dropdownroomsharing d ON g.roomShareId = d.roomShareId
         WHERE g.groupTourId = ?`,
        [groupTourId]
      );

      return res.status(200).json({ data: roomPrice });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server Error" });
    }
  }
);

// GET /api/get-guest-details-gt?familyHeadGtId=1&enquiryGroupId=1
router.get(
  "/get-guest-details-gt",
  [
    query("enquiryGroupId")
      .notEmpty()
      .withMessage("enquiryGroupId is required"),
    query("familyHeadGtId")
      .notEmpty()
      .withMessage("familyHeadGtId is required"),
  ],
  async (req, res) => {
    try {
      // Token check
      const token = req.header("token");
      const allowedRoles = [144, 158, 178, 207, 215, 228, 316, 317];
      const tokenData = await CommonController.checkToken(token, allowedRoles);
      if (tokenData instanceof Object && tokenData.status) {
        return res.status(tokenData.status).json(tokenData);
      }

      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ message: errors.array().map((err) => err.msg) });
      }

      const { enquiryGroupId, familyHeadGtId } = req.query;

      // Fetch guest details
      const [guests] = await pool.query(
        `SELECT g.*, p.preFixName
         FROM grouptourguestdetails g
         LEFT JOIN dropdownprefix p ON g.preFixId = p.preFixId
         JOIN grouptours t ON g.groupTourId = t.groupTourId
         WHERE g.familyHeadGtId = ? AND g.enquiryGroupId = ?`,
        [familyHeadGtId, enquiryGroupId]
      );

      // Transform result similar to PHP code
      const getGuestsDataArray = guests.map((guest) => ({
        preFixId: guest.preFixId,
        preFixName: guest.preFixName,
        firstName: guest.firstName,
        // middleName: guest.middleName, // uncomment if needed
        lastName: guest.lastName,
        destinationId: guest.destinationId,
        gender: guest.gender,
        contact: guest.contact,
        roomShareId: guest.roomShareId,
        address: guest.address,
        // state: guest.state,
        // city: guest.city,
        // pincode: guest.pincode,
        mailId: guest.mailId,
        dob: guest.dob,
        marriageDate: guest.marriageDate,
        adharCard: guest.adharCard,
        passport: guest.passport,
        passportNo: guest.passportNo,
        passport_issue_date: guest.passport_issue_date,
        passport_expiry_date: guest.passport_expiry_date,
        pan: guest.pan,
        panNo: guest.panNo,
        adharNo: guest.adharNo,
        guestId: guest.guestId,
      }));

      return res.status(200).json({ data: getGuestsDataArray });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Server Error" });
    }
  }
);
// routes/planEnqRoute.js
// ✅ GET /view-plan-enq-users-data-ct
router.get("/view-plan-enq-users-data-ct", async (req, res) => {
  try {
    // ✅ Validate input
    const planEnqId = req.query.planEnqId;
    if (!planEnqId) {
      return res.status(400).json({
        message: [
          {
            type: "field",
            msg: "planEnqId is required",
            path: "planEnqId",
            location: "query",
          },
        ],
      });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [304]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Fetch record
    const [rows] = await db.query(
      `SELECT * FROM planenqusers 
       WHERE id = ? AND planningType = 2 
       LIMIT 1`,
      [planEnqId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "plan enquiry not found" });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error("Error fetching plan enquiry user (CT):", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

router.post(
  "/enquiry-group-tour",
  [
    body("groupName").notEmpty().withMessage("groupName is required"),
    body("groupTourId")
      .notEmpty()
      .withMessage("groupTourId is required")
      .bail()
      .isNumeric()
      .withMessage("groupTourId must be numeric"),
    body("enquiryReferId")
      .notEmpty()
      .withMessage("enquiryReferId is required")
      .bail()
      .isNumeric()
      .withMessage("enquiryReferId must be numeric"),
    body("familyHeadNo")
      .notEmpty()
      .withMessage("familyHeadNo is required")
      .bail()
      .isNumeric()
      .withMessage("familyHeadNo must be numeric"),
    body("nextFollowUp")
      .notEmpty()
      .withMessage("nextFollowUp is required"),
    body("nextFollowUpTime")
      .notEmpty()
      .withMessage("nextFollowUpTime is required"),
    body("contact").notEmpty().withMessage("contact is required"),
    body("adults")
      .notEmpty()
      .withMessage("adults is required")
      .bail()
      .isNumeric()
      .withMessage("adults must be numeric"),
    body("child")
      .optional()
      .isNumeric()
      .withMessage("child must be numeric"),
    body("priorityId")
      .optional()
      .isNumeric()
      .withMessage("priorityId must be numeric"),
    body("guestRefId").optional().isString(),
    body("guestenquiryref").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ message: errors.array().map((err) => err.msg) });
      }

      const tokenData = await CommonController.checkToken(req.headers["token"], [
        25,
        26,
        118,
        294,
        302,
      ]);
      if (!tokenData || tokenData.status !== 200) {
        return res.status(tokenData?.status || 401).json({
          message: tokenData?.message || "Invalid Token",
        });
      }

      const {
        groupName,
        groupTourId,
        enquiryReferId,
        priorityId,
        nextFollowUp,
        nextFollowUpTime,
        contact,
        remark = "",
        mail,
        email,
        fullName,
        guestName,
        nameofguest,
        familyHeadNo,
        guestRefId,
        guestenquiryref,
        adults,
        child,
        assignTo,
        countryCode,
      } = req.body;

      const resolvedName = (fullName || guestName || nameofguest || "").trim();
      if (!resolvedName) {
        return res.status(400).json({ message: ["fullName is required"] });
      }

      const normalizedName = resolvedName.replace(/\s+/g, " ");
      const [firstName, ...rest] = normalizedName.split(" ");
      const lastName = rest.join(" ");

      const adultsCount = Number(adults || 0);
      const childCount = Number(child || 0);
      if (Number.isNaN(adultsCount) || adultsCount < 0) {
        return res
          .status(400)
          .json({ message: ["adults must be a positive number"] });
      }
      if (Number.isNaN(childCount) || childCount < 0) {
        return res
          .status(400)
          .json({ message: ["child must be zero or a positive number"] });
      }
      if (adultsCount + childCount === 0) {
        return res
          .status(400)
          .json({ message: ["Total guests must be greater than zero"] });
      }
      if (adultsCount + childCount > 6) {
        return res
          .status(400)
          .json({ message: ["Pax size cannot be more than 6"] });
      }

      const parsedFamilyHeadNo = Number(familyHeadNo);
      if (Number.isNaN(parsedFamilyHeadNo) || parsedFamilyHeadNo <= 0) {
        return res
          .status(400)
          .json({ message: ["familyHeadNo must be a positive number"] });
      }

      let phone = String(contact || "").trim();
      if (!phone) {
        return res.status(400).json({ message: ["contact is required"] });
      }
      if (countryCode && !phone.startsWith("+")) {
        phone = `${countryCode}${phone}`;
      }

      const resolvedGuestRefId = guestRefId || guestenquiryref || null;
      const resolvedEmail = mail || email || null;
      const tokenUser = tokenData.data || {};
      const assignedTo = assignTo ? Number(assignTo) : tokenUser.userId;
      const clientcode = tokenUser.clientcode || "CODIGIX01";

      if (!assignedTo || Number.isNaN(assignedTo)) {
        return res
          .status(400)
          .json({ message: ["assignTo is required"] });
      }

      let connection;
      try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [tourRows] = await connection.query(
          "SELECT groupTourId, startDate FROM grouptours WHERE groupTourId = ? LIMIT 1",
          [groupTourId]
        );
        if (!tourRows.length) {
          await connection.rollback();
          return res.status(404).json({ message: "Group tour not found" });
        }

        const [counterRows] = await connection.query(
          "SELECT value FROM counter WHERE countId = 1 FOR UPDATE"
        );
        const counterValue = counterRows.length
          ? Number(counterRows[0].value)
          : 1;
        await connection.query("UPDATE counter SET value = ? WHERE countId = 1", [
          counterValue + 1,
        ]);
        const enquiryId = counterValue.toString().padStart(4, "0");

        const guestIdentifier =
          req.body.guestId ||
          CommonController.generateGuestId(firstName || "GT", lastName || "Guest");

        await connection.query(
          `INSERT INTO enquirygrouptours
            (groupTourId, guestId, guestRefId, enquiryReferId, priorityId, groupName, firstName, lastName, contact, mail, adults, child, familyHeadNo, assignTo, nextFollowUp, nextFollowUpTime, remark, enquiryId, createdBy, clientcode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            groupTourId,
            guestIdentifier,
            resolvedGuestRefId,
            enquiryReferId,
            priorityId || null,
            groupName,
            firstName,
            lastName || null,
            phone,
            resolvedEmail,
            adultsCount,
            childCount,
            parsedFamilyHeadNo,
            assignedTo,
            nextFollowUp,
            nextFollowUpTime,
            remark,
            enquiryId,
            tokenUser.userId,
            clientcode,
          ]
        );

        await connection.query(
          `INSERT INTO enquiries (enquiryId, createdBy, tourType, startDate, uniqueId, clientcode)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE createdBy = VALUES(createdBy), tourType = VALUES(tourType), startDate = VALUES(startDate), uniqueId = VALUES(uniqueId), clientcode = VALUES(clientcode)`,
          [
            enquiryId,
            tokenUser.userId,
            1,
            tourRows[0].startDate || null,
            enquiryId,
            clientcode,
          ]
        );

        await connection.commit();
        return res
          .status(201)
          .json({ message: "Group tour enquiry created successfully", data: { enquiryId } });
      } catch (error) {
        if (connection) {
          await connection.rollback();
        }
        console.error("Error creating group tour enquiry:", error);
        return res.status(500).json({ message: "Internal Server Error" });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    } catch (error) {
      console.error("Error creating group tour enquiry:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

// POST /assign-user-to-plan-enq-gt

router.post(
  "/assign-user-to-plan-enq-gt",
  [
    body("planEnqId").notEmpty().withMessage("planEnqId is required"),
    body("familyHeadNo").notEmpty().withMessage("familyHeadNo is required"),
    body("assignTo").notEmpty().withMessage("assignTo is required"),
    body("nextFollowUp").notEmpty().withMessage("nextFollowUp is required"),
    body("nextFollowUpTime")
      .notEmpty()
      .withMessage("nextFollowUpTime is required"),
    body("enquiryReferId")
      .optional()
      .isString()
      .withMessage("enquiryReferId must be a string"),
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ message: errors.array() });

      // Token check
      const tokenData = await CommonController.checkToken(
        req.headers["token"],
        [302]
      );
      if (tokenData.error) return res.status(401).json(tokenData);

      // Fetch planned enquiry
      const [planEnqRows] = await db.query(
        "SELECT * FROM planenqusers WHERE id = ? AND planningType = 1",
        [req.body.planEnqId]
      );
      if (!planEnqRows.length)
        return res.status(404).json({ message: "Plan enquiry not found" });
      const planEnq = planEnqRows[0];

      // Fetch group tour
      const [groupTourRows] = await db.query(
        "SELECT * FROM grouptours WHERE groupTourId = ?",
        [planEnq.groupTourId]
      );
      if (!groupTourRows.length)
        return res.status(404).json({ message: "Group Tour not found" });
      const groupTour = groupTourRows[0];

      // Map enquiryReferId string to integer
      let enquiryReferInt = 0; // default
      if (req.body.enquiryReferId) {
        const [refRows] = await db.query(
          "SELECT enquiryReferId FROM dropdownenquiryreference WHERE enquiryReferName = ?",
          [req.body.enquiryReferId]
        );
        if (refRows.length) enquiryReferInt = refRows[0].enquiryReferId;
      }

      // Generate unique IDs
      const guestId = "CODIGIX" + Date.now();
      const [counterRows] = await db.query(
        "SELECT value FROM counter WHERE countId = 1"
      );
      let enquiryId = counterRows.length
        ? String(counterRows[0].value).padStart(4, "0")
        : "0001";

      // Insert into enquirygrouptours
      const insertQuery = `
        INSERT INTO enquirygrouptours
          (groupTourId, guestId, enquiryReferId, groupName, firstName, contact, adults, familyHeadNo, assignTo, nextFollowUp, nextFollowUpTime, remark, enquiryId, createdBy, clientcode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await db.query(insertQuery, [
        planEnq.groupTourId,
        guestId,
        enquiryReferInt,
        planEnq.groupName,
        planEnq.firstName,
        planEnq.contactNo,
        planEnq.noOfTravelPeople,
        req.body.familyHeadNo,
        req.body.assignTo,
        req.body.nextFollowUp,
        req.body.nextFollowUpTime,
        req.body.remark || "",
        enquiryId,
        req.body.assignTo,
        "CODIGIX01", // default clientcode
      ]);

      // Insert into common enquiries table
      const insertEnqQuery = `
        INSERT INTO enquiries
          (enquiryId, createdBy, tourType, startDate, uniqueId, clientcode)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await db.query(insertEnqQuery, [
        enquiryId,
        req.body.assignTo,
        1,
        groupTour.startDate,
        enquiryId,
        "CODIGIX01", // default clientcode
      ]);

      // Delete from planenqusers
      await db.query(
        "DELETE FROM planenqusers WHERE id = ? AND planningType = 1",
        [req.body.planEnqId]
      );

      return res
        .status(200)
        .json({ message: "User assigned to plan enquiry successfully" });
    } catch (error) {
      console.error("Error assigning user to plan enquiry:", error);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  }
);
// ✅ POST /assign-user-to-plan-enq-ct
router.post("/assign-user-to-plan-enq-ct", async (req, res) => {
  const connection = await db.getConnection(); // transaction
  try {
    // ✅ Validate input
    const {
      planEnqId,
      familyHeadNo,
      assignTo,
      hotelCatId,
      rooms,
      mealPlanId,
      nextFollowUp,
      nextFollowUpTime,
    } = req.body;

    if (
      !planEnqId ||
      !familyHeadNo ||
      !assignTo ||
      !hotelCatId ||
      !rooms ||
      !mealPlanId ||
      !nextFollowUp ||
      !nextFollowUpTime
    ) {
      return res.status(400).json({
        message:
          "All fields (planEnqId, familyHeadNo, assignTo, hotelCatId, rooms, mealPlanId, nextFollowUp, nextFollowUpTime) are required",
      });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [304]);
    if (tokenData.error) return res.status(401).json(tokenData);

    await connection.beginTransaction();

    // ✅ Fetch planenqusers data
    const [planRows] = await connection.query(
      `SELECT * FROM planenqusers WHERE id = ? AND planningType = 2 LIMIT 1`,
      [planEnqId]
    );
    if (planRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "plan enquiry not found" });
    }
    const planenq = planRows[0];

    // ✅ Get enquiryId from counter table
    const [counterRows] = await connection.query(
      `SELECT value FROM counter WHERE countId = 1 FOR UPDATE`
    );
    if (counterRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Counter not found" });
    }
    let enquiryId = counterRows[0].value;
    enquiryId = enquiryId.toString().padStart(4, "0", "0");

    // ✅ Insert into enquirycustomtours
    const [customTourResult] = await connection.query(
      `INSERT INTO enquirycustomtours 
       (groupName, firstName, destinationId, contact, startDate, endDate, countryId, stateId, nights, days, hotelCatId, adults, rooms, mealPlanId, familyHeadNo, enquiryReferId, nextFollowUp, nextFollowUpTime, notes, enquiryId, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planenq.groupName,
        planenq.firstName,
        planenq.destinationId,
        planenq.contactNo,
        planenq.startDate,
        planenq.endDate,
        planenq.countryId,
        planenq.stateId,
        planenq.nights,
        planenq.days,
        hotelCatId,
        planenq.noOfTravelPeople,
        rooms,
        mealPlanId,
        familyHeadNo,
        planenq.hearAbout,
        nextFollowUp,
        nextFollowUpTime,
        planenq.comments,
        enquiryId,
        assignTo,
      ]
    );

    const customTourId = customTourResult.insertId;

    // ✅ Insert into enquiries
    await connection.query(
      `INSERT INTO enquiries (enquiryId, createdBy, tourType, startDate, uniqueId, clientcode)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        customTourId,
        assignTo,
        2,
        planenq.startDate,
        enquiryId,
        planenq.clientcode || "CODIGIX01",
      ]
    );

    // ✅ Delete from planenqusers
    await connection.query(
      `DELETE FROM planenqusers WHERE id = ? AND planningType = 2`,
      [planEnqId]
    );

    await connection.commit();

    return res
      .status(200)
      .json({ message: "User assigned to plan enquiry successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Error assigning user to plan enquiry (CT):", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/view-bill-group-tour?enquiryGroupId=...&familyHeadGtId=...

// //GET /api/view-bill-group-tour?familyHeadGtId=...&enquiryGroupId=...
// router.get("/view-bill-group-tour", async (req, res) => {
//   const { familyHeadGtId, enquiryGroupId } = req.query;

//   if (!familyHeadGtId || !enquiryGroupId) {
//     return res
//       .status(400)
//       .json({ message: "familyHeadGtId and enquiryGroupId are required" });
//   }

//   const connection = await db.getConnection();
//   try {
//     // Get group payment details
//     const [grouppaymentDetails] = await connection.query(
//       `SELECT gfh.familyHeadGtId, gfh.enquiryGroupId, gdd.billingName, gdd.address,
//               gdd.phoneNo, gdd.gstin, gdd.panNo, gdd.grandTotal
//        FROM grouptourfamilyheaddetails gfh
//        JOIN grouptourdiscountdetails gdd ON gfh.familyHeadGtId = gdd.familyHeadGtId
//        WHERE gfh.status = 1 AND gfh.familyHeadGtId = ? AND gfh.enquiryGroupId = ?`,
//       [familyHeadGtId, enquiryGroupId]
//     );

//     if (!grouppaymentDetails.length) {
//       return res.status(200).json({
//         message: "You have not submitted details for this family head enquiry",
//       });
//     }

//     // Get payment details
//     const [paymentDetails] = await connection.query(
//       `SELECT groupPaymentDetailId, advancePayment, balance, status, receiptNo
//        FROM grouptourpaymentdetails
//        WHERE familyHeadGtId = ? AND enquiryGroupId = ?`,
//       [familyHeadGtId, enquiryGroupId]
//     );

//     const advancePaymentSum = paymentDetails.reduce(
//       (sum, pd) => sum + Number(pd.advancePayment || 0),
//       0
//     );

//     const isBalance =
//       Number(grouppaymentDetails[0].grandTotal) <= advancePaymentSum;

//     const advancePayments = paymentDetails.map((pd) => ({
//       groupPaymentDetailId: pd.groupPaymentDetailId,
//       advancePayment: Number(pd.advancePayment || 0),
//       balance: Number(pd.balance || 0),
//       status: pd.status,
//       statusDesceription: "0-pending,1-confirm",
//       receiptNo: pd.receiptNo ? `RN${pd.receiptNo}` : "",
//     }));

//     const responseData = {
//       enquiryGroupId: grouppaymentDetails[0].enquiryGroupId,
//       familyHeadGtId: grouppaymentDetails[0].familyHeadGtId,
//       billingName: grouppaymentDetails[0].billingName,
//       address: grouppaymentDetails[0].address,
//       phoneNumber: grouppaymentDetails[0].phoneNo,
//       gstIn: grouppaymentDetails[0].gstin,
//       panNumber: grouppaymentDetails[0].panNo,
//       grandTotal: Number(grouppaymentDetails[0].grandTotal),
//       advancePayments,
//       balance: advancePayments.length
//         ? advancePayments[advancePayments.length - 1].balance
//         : 0,
//       isPaymentDone: isBalance,
//     };

//     res.status(200).json({ data: responseData });
//   } catch (error) {
//     console.error("❌ viewBillGroupTour error:", error);
//     res.status(500).json({ error: error.message });
//   } finally {
//     connection.release();
//   }
// });
// GET /viewNew-pay-details?groupPaymentDetailId=123
// router.get("/viewNew-pay-details", async (req, res) => {
//   const { groupPaymentDetailId } = req.query;

//   if (!groupPaymentDetailId) {
//     return res
//       .status(400)
//       .json({ message: "groupPaymentDetailId is required" });
//   }

//   const connection = await db.getConnection();
//   try {
//     const [payDetails] = await connection.query(
//       `SELECT gpd.advancePayment, gpd.bankName, dpm.paymentModeName AS paymentMode, gpd.chequeNo,
//               gpd.paymentDate, gpd.transactionId, gpd.transactionProof, gpd.status,
//               dct.cardTypeId, dct.cardTypeName
//        FROM grouptourpaymentdetails gpd
//        JOIN dropdownpaymentmode dpm ON gpd.paymentModeId = dpm.paymentModeId
//        LEFT JOIN dropdowncardtype dct ON gpd.cardTypeId = dct.cardTypeId
//        WHERE gpd.groupPaymentDetailId = ?`,
//       [groupPaymentDetailId]
//     );

//     if (!payDetails.length) {
//       return res
//         .status(404)
//         .json({ message: "Payment is confirmed or not found" });
//     }

//     res.status(200).json(payDetails[0]);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   } finally {
//     connection.release();
//   }
// });
// ✅ routes/groupTourRoutes.js

// ✅ GET all-list-gt-miscellaneous-files-details
router.get("/all-list-gt-miscellaneous-files-details", async (req, res) => {
  try {
    const { groupTourId, page = 1, perPage = 10 } = req.query;

    // ✅ Validation
    if (!groupTourId) {
      return res.status(400).json({ message: "groupTourId is required" });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [368]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;

    // ✅ Count total records
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM miscellaneousfiles WHERE groupTourId = ?`,
      [groupTourId]
    );
    const total = countResult[0].total;

    // ✅ Fetch paginated results
    const [rows] = await db.query(
      `
      SELECT 
        miscellaneousFilesId,
        busListUrl,
        airTicketsUrl,
        flightTicketsUrl,
        othersUrl
      FROM miscellaneousfiles
      WHERE groupTourId = ?
      ORDER BY miscellaneousFilesId DESC
      LIMIT ? OFFSET ?
      `,
      [groupTourId, limit, offset]
    );

    // ✅ Format response array
    const miscellaneousFilesArray = rows.map((value) => ({
      miscellaneousFilesId: value.miscellaneousFilesId,
      busListUrl: value.busListUrl,
      airTicketsUrl: value.airTicketsUrl,
      flightTicketsUrl: value.flightTicketsUrl,
      othersUrl: value.othersUrl,
    }));

    return res.status(200).json({
      data: miscellaneousFilesArray,
      total,
      currentPage: parseInt(page),
      perPage: limit,
      nextPageUrl:
        parseInt(page) * limit < total
          ? `/api/all-list-gt-miscellaneous-files-details?groupTourId=${groupTourId}&page=${
              parseInt(page) + 1
            }&perPage=${limit}`
          : null,
      previousPageUrl:
        parseInt(page) > 1
          ? `/api/all-list-gt-miscellaneous-files-details?groupTourId=${groupTourId}&page=${
              parseInt(page) - 1
            }&perPage=${limit}`
          : null,
      lastPage: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error in allListGTMiscellaneousFilesDetails:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET: /api/get-gt-guest-details?groupTourId=28
// Node.js route: GET /api/get-gt-guest-details
// router.get("/get-gt-guest-details", async (req, res) => {
//   try {
//     const { groupTourId } = req.query;
//     if (!groupTourId)
//       return res.status(400).json({ message: "groupTourId is required" });

//     // Token check (replace with your token logic)
//     const token = req.headers["token"];
//     const tokenData = await CommonController.checkToken(token, [320]);
//     if (tokenData.error) return res.status(401).json(tokenData);

//     // Get all guests for the groupTourId
//     const [guests] = await db.query(
//       `SELECT *
//        FROM confirm_group_tour
//        WHERE groupTourId = ?`,
//       [groupTourId]
//     );

//     return res.status(200).json({
//       data: guests,
//       total: guests.length,
//     });
//   } catch (err) {
//     console.error("Error in get-gt-guest-details:", err);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });  full working
// Assuming you have express, mysql2, and a CommonController for token validation

// router.get("/all-list-gt-supplier-payments-details", async (req, res) => {
//   try {
//     const token = req.headers["token"];
//     const tokenData = await CommonController.checkToken(token, [367]);
//     if (tokenData.error) return res.status(401).json(tokenData);

//     const userId = tokenData.userId;
//     const { groupTourId } = req.query;
//     let perPage = parseInt(req.query.perPage) || 10;
//     let page = parseInt(req.query.page) || 1;

//     if (!groupTourId)
//       return res.status(400).json({ message: ["groupTourId is required"] });

//     const offset = (page - 1) * perPage;

//     // ✅ Count total records
//     const [countRows] = await db.query(
//       "SELECT COUNT(*) as total FROM supplierpayments WHERE groupTourId = ?",
//       [groupTourId]
//     );
//     const total = countRows[0].total;

//     // ✅ Fetch paginated supplier payments
//     const [rows] = await db.query(
//       "SELECT * FROM supplierpayments WHERE groupTourId = ? ORDER BY supplierPaymentId DESC LIMIT ? OFFSET ?",
//       [groupTourId, perPage, offset]
//     );

//     let totalSum = 0;
//     let balanceSum = 0;

//     const supplierPaymentsArray = rows.map((row) => {
//       totalSum += parseFloat(row.total || 0);
//       balanceSum += parseFloat(row.balance || 0);

//       return {
//         supplierPaymentId: row.supplierPaymentId,
//         supplierName: row.supplierName,
//         type: row.type,
//         total: row.total,
//         paymentDetails: row.paymentDetails,
//         balance: row.balance,
//       };
//     });

//     // ✅ Proper pagination URLs
//     const lastPage = Math.ceil(total / perPage);

//     return res.status(200).json({
//       data: supplierPaymentsArray,
//       totalPayment: totalSum,
//       totalBalance: balanceSum,
//       total,
//       currentPage: page,
//       perPage,
//       nextPageUrl:
//         page < lastPage
//           ? `/all-list-gt-supplier-payments-details?groupTourId=${groupTourId}&page=${
//               page + 1
//             }&perPage=${perPage}`
//           : null,
//       previousPageUrl:
//         page > 1
//           ? `/all-list-gt-supplier-payments-details?groupTourId=${groupTourId}&page=${
//               page - 1
//             }&perPage=${perPage}`
//           : null,
//       lastPage,
//     });
//   } catch (err) {
//     console.error("Error in all-list-gt-supplier-payments-details:", err);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// POST: Add GT Supplier Payments
// routes/supplierPayments.js

router.post("/add-gt-supplier-payments-details", async (req, res) => {
  try {
    const { supplierName, type, total, paymentDetails, balance, groupTourId } =
      req.body;

    // ✅ Validation
    if (!supplierName || supplierName.length > 255)
      return res
        .status(400)
        .json({ message: ["supplierName is required or too long"] });

    if (!type || type.length > 255)
      return res
        .status(400)
        .json({ message: ["type is required or too long"] });

    if (total === undefined || isNaN(total) || total < 0)
      return res.status(400).json({ message: ["total must be a number >= 0"] });

    if (!paymentDetails)
      return res.status(400).json({ message: ["paymentDetails is required"] });

    if (balance === undefined || isNaN(balance) || balance < 0)
      return res
        .status(400)
        .json({ message: ["balance must be a number >= 0"] });

    if (!groupTourId)
      return res.status(400).json({ message: ["groupTourId is required"] });

    // ✅ Token validation
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [367]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Fallbacks
    const createdBy = tokenData.userId || 1; // default if token fails
    const clientcode = "C001"; // default clientcode

    // ✅ Check if group tour exists
    const [groupTourRows] = await db.query(
      "SELECT * FROM grouptours WHERE groupTourId = ?",
      [groupTourId]
    );
    if (groupTourRows.length === 0)
      return res.status(404).json({ message: "Group Tour Not Found" });

    // ✅ Calculate balance if paymentDetails is array of numbers
    let calculatedBalance = balance;
    if (Array.isArray(paymentDetails)) {
      calculatedBalance = total - paymentDetails.reduce((a, b) => a + b, 0);
      if (calculatedBalance !== Number(balance))
        return res
          .status(400)
          .json({ message: "Payment Details and Balance are not matching" });
    }

    // ✅ Insert into supplierpayments
    const [insertResult] = await db.query(
      `INSERT INTO supplierpayments 
        (groupTourId, supplierName, type, total, paymentDetails, balance, clientcode, createdBy, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        groupTourId,
        supplierName,
        type,
        total,
        typeof paymentDetails === "string"
          ? paymentDetails
          : JSON.stringify(paymentDetails),
        balance,
        clientcode,
        createdBy,
      ]
    );

    if (insertResult.affectedRows === 1) {
      return res
        .status(200)
        .json({ message: "Supplier Payment Details Added Successfully" });
    } else {
      return res.status(500).json({ message: "Something went wrong" });
    }
  } catch (err) {
    console.error("Error in addGTSupplierPaymentsDetails:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET /api/loyality-point-history
router.get("/loyality-point-history", async (req, res) => {
  try {
    // ✅ Validate query params
    const schema = Joi.object({
      guestId: Joi.string().required(),
      page: Joi.number().default(1),
      perPage: Joi.number().default(10),
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((e) => e.message) });
    }

    const { guestId, page, perPage } = value;

    // ✅ Get user by guestId
    const [userRows] = await db.query(
      `SELECT userId, clientcode FROM users WHERE guestId = ?`,
      [guestId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "Guest not found" });
    }

    const user = userRows[0];
    const offset = (page - 1) * perPage;

    // ✅ Get loyalty points for user
    const [loyaltyRows] = await db.query(
      `SELECT * FROM loyaltypoints 
       WHERE userId = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [user.userId, perPage, offset]
    );

    // ✅ Transform response
    const loyaltyData = [];
    for (let row of loyaltyRows) {
      let planName = "-";
      let tourType = "-";

      if (row.isGroupCustom === 1) {
        const [plan] = await db.query(
          `SELECT g.tourName FROM enquirygrouptours e 
           JOIN grouptours g ON e.groupTourId = g.groupTourId 
           WHERE e.enquiryGroupId = ?`,
          [row.enquiryId]
        );
        tourType = "Group Tour";
        planName = plan.length ? plan[0].tourName : "-";
      } else if (row.isGroupCustom === 2) {
        const [plan] = await db.query(
          `SELECT groupName FROM enquirycustomtours WHERE enquiryCustomId = ?`,
          [row.enquiryId]
        );
        tourType = "Custom Tour";
        planName = plan.length ? plan[0].groupName : "-";
      }

      loyaltyData.push({
        loyaltyPoint: row.loyaltyPoint,
        description: row.description,
        descType: row.descType,
        isType: row.isType,
        isTypeDescription: "0-credit, 1-debit",
        tour: tourType,
        planName: planName,
        created_at: row.created_at,
      });
    }

    // ✅ Get total count for pagination
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM loyaltypoints WHERE userId = ?`,
      [user.userId]
    );

    const lastPage = Math.ceil(total / perPage);

    return res.status(200).json({
      data: loyaltyData,
      total,
      currentPage: page,
      perPage,
      lastPage,
      nextPageUrl:
        page < lastPage
          ? `/api/loyality-point-history?guestId=${guestId}&page=${
              page + 1
            }&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/loyality-point-history?guestId=${guestId}&page=${
              page - 1
            }&perPage=${perPage}`
          : null,
    });
  } catch (err) {
    console.error("❌ Error fetching loyalty points:", err);
    res.status(500).json({ message: err.message });
  }
});
// POST: /api/update-user-status
router.post("/update-user-status", async (req, res) => {
  try {
    const normalize = (value) =>
      value === undefined ||
      value === null ||
      value === "undefined" ||
      value === "null"
        ? undefined
        : value;
    const token =
      normalize(req.headers["token"]) ||
      normalize(req.body?.token) ||
      normalize(req.query?.token) ||
      normalize(req.query?.headers?.token) ||
      normalize(req.query["headers[token]"]);
    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }
    const tokenData = await CommonController.checkToken(token, [130]);
    if (!tokenData || tokenData.status !== 200) {
      return res
        .status(tokenData?.status || 401)
        .json({ message: tokenData?.message || "Invalid Token" });
    }
    const rawUserId = normalize(
      req.body.userId ??
        req.query.userId ??
        req.query["params[userId]"] ??
        req.query.params?.userId
    );
    const resolvedUserId = rawUserId ?? tokenData.data?.userId;
    const userId = Number(resolvedUserId);
    if (!resolvedUserId || Number.isNaN(userId)) {
      return res
        .status(400)
        .json({ message: "userId is required and must be numeric" });
    }
    const statusValue = normalize(
      req.body.status ??
        req.query.status ??
        req.query["params[status]"] ??
        req.query.params?.status ??
        req.body?.statusValue
    );
    const [users] = await db.query("SELECT * FROM users WHERE userId = ?", [
      userId,
    ]);
    if (!users || users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    await db.query("UPDATE users SET status = ? WHERE userId = ?", [
      statusValue,
      userId,
    ]);
    return res
      .status(200)
      .json({ message: "User status updated successfully" });
  } catch (err) {
    console.error("Error in updateUserStatus:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
router.post(
  "/update-users-data",
  [
    body("userId")
      .isNumeric()
      .withMessage("userId is required and must be numeric"),
    body("positionId").optional(),
    body("departmentId").optional(),
    body("sectorId").optional(),
  ],
  async (req, res) => {
    try {
      // ✅ Check token
      const token = req.headers["token"];
      const tokenData = await CommonController.checkToken(token, [129]);
      if (!tokenData || tokenData.error) {
        return res.status(401).json({ message: "Invalid Token" });
      }

      // ✅ Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ message: errors.array().map((e) => e.msg) });
      }

      const {
        userId,
        userName,
        email,
        roleId,
        contact,
        address,
        gender,
        status,
        establishmentName,
        establishmentTypeId,
        adharCard,
        adharNo,
        pan,
        panNo,
        city,
        pincode,
        state,
        alternatePhone,
        shopAct,
        accName,
        accNo,
        bankName,
        branch,
        ifsc,
        cheque,
        logo,
        departmentId,
        positionId,
        sectorId,
      } = req.body;

      // ✅ Check if user exists
      const [users] = await db.query("SELECT * FROM users WHERE userId = ?", [
        userId,
      ]);
      if (!users.length)
        return res.status(404).json({ message: "User not found" });

      // ✅ Check if user details already exist
      const [existingRecord] = await db.query(
        "SELECT * FROM userdetails WHERE userId = ?",
        [userId]
      );

      // ✅ Start transaction
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // Update users table
        await connection.query(
          `UPDATE users SET
            userName = ?, email = ?, roleId = ?, contact = ?, address = ?,
            gender = ?, status = ?, establishmentName = ?, establishmentTypeId = ?,
            adharCard = ?, adharNo = ?, pan = ?, panNo = ?
           WHERE userId = ?`,
          [
            userName,
            email,
            roleId,
            contact,
            address,
            gender,
            status,
            establishmentName,
            establishmentTypeId,
            adharCard,
            adharNo,
            pan,
            panNo,
            userId,
          ]
        );

        if (existingRecord.length) {
          // Update userdetails
          await connection.query(
            `UPDATE userdetails SET
              city = ?, pincode = ?, state = ?, alternatePhone = ?, shopAct = ?,
              accName = ?, accNo = ?, bankName = ?, branch = ?, ifsc = ?,
              cheque = ?, logo = ?, departmentId = ?, positionId = ?, sectorId = ?
             WHERE userId = ?`,
            [
              city,
              pincode,
              state,
              alternatePhone,
              shopAct,
              accName,
              accNo,
              bankName,
              branch,
              ifsc,
              cheque,
              logo,
              departmentId,
              positionId,
              sectorId,
              userId,
            ]
          );
        } else {
          // Insert new userdetails
          await connection.query(
            `INSERT INTO userdetails
              (userId, city, pincode, state, alternatePhone, shopAct, accName, accNo,
               bankName, branch, ifsc, cheque, logo, departmentId, positionId, sectorId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              city,
              pincode,
              state,
              alternatePhone,
              shopAct,
              accName,
              accNo,
              bankName,
              branch,
              ifsc,
              cheque,
              logo,
              departmentId,
              positionId,
              sectorId,
            ]
          );
        }

        await connection.commit();
        connection.release();
        return res.json({ message: "Users updated successfully" });
      } catch (err) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ message: err.message });
      }
    } catch (err) {
      console.error("Error in update-users-data:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

router.get("/view-users-data", async (req, res) => {
  try {
    const normalize = (value) =>
      value === undefined ||
      value === null ||
      value === "undefined" ||
      value === "null"
        ? undefined
        : value;
    const token =
      normalize(req.headers["token"]) ||
      normalize(req.query?.token) ||
      normalize(req.query?.headers?.token) ||
      normalize(req.query["headers[token]"]) ||
      normalize(req.query.params?.token);
    if (!token) return res.status(401).json({ message: "Token is required" });
    const tokenData = await CommonController.checkToken(token, [367]);
    if (!tokenData || tokenData.status !== 200) {
      return res
        .status(tokenData?.status || 401)
        .json({ message: tokenData?.message || "Invalid Token" });
    }
    const rawUserId = normalize(
      req.query.userId ??
        req.query["params[userId]"] ??
        req.query.params?.userId ??
        req.body?.userId
    );
    const resolvedUserId = rawUserId ?? tokenData.data?.userId;
    const userId = Number(resolvedUserId);
    if (!resolvedUserId || Number.isNaN(userId)) {
      return res
        .status(400)
        .json({ message: "userId is required and must be numeric" });
    }
    const [usersData] = await db.query(
      `SELECT u.*, r.roleName 
       FROM users u
       JOIN roles r ON u.roleId = r.roleId
       WHERE u.userId = ?`,
      [userId]
    );
    if (!usersData.length) {
      return res.status(404).json({ message: "User does not exist" });
    }
    const user = usersData[0];
    let userInfo = {};
    try {
      const [userInfoData] = await db.query(
        `SELECT ud.*, s.sectorName, dp.positionName, dd.departmentName
         FROM user_details_view ud
         LEFT JOIN sectors s ON ud.sectorId = s.sectorId
         LEFT JOIN dropdownpositions dp ON ud.positionId = dp.positionId
         LEFT JOIN dropdowndepartment dd ON ud.departmentId = dd.departmentId
         WHERE ud.userId = ?`,
        [userId]
      );
      if (userInfoData.length) {
        userInfo = userInfoData[0];
      }
    } catch (viewErr) {
      console.warn("user_details_view unavailable, falling back to userdetails", viewErr.code);
      const [userInfoData] = await db.query(
        `SELECT ud.*, s.sectorName, dp.positionName, dd.departmentName
         FROM userdetails ud
         LEFT JOIN sectors s ON ud.sectorId = s.sectorId
         LEFT JOIN dropdownpositions dp ON ud.positionId = dp.positionId
         LEFT JOIN dropdowndepartment dd ON ud.departmentId = dd.departmentId
         WHERE ud.userId = ?`,
        [userId]
      );
      if (userInfoData.length) {
        userInfo = userInfoData[0];
      }
    }
    const myObj = {
      userId: user.userId,
      userName: user.userName || "",
      email: user.email || "",
      contact: user.contact || "",
      status: user.status || 0,
      gender: user.gender || "",
      roleId: user.roleId,
      roleName: user.roleName || "",
      address: user.address || "",
      adharCard: user.adharCard || "",
      adharNo: user.adharNo || "",
      pan: user.pan || "",
      panNo: user.panNo || "",
      establishmentName: user.establishmentName || "",
      establishmentTypeId: user.establishmentTypeId || null,
      city: userInfo.city || "",
      pincode: userInfo.pincode || "",
      state: userInfo.state || "",
      alternatePhone: userInfo.alternatePhone || "",
      shopAct: userInfo.shopAct || "",
      accName: userInfo.accName || "",
      accNo: userInfo.accNo || "",
      bankName: userInfo.bankName || "",
      branch: userInfo.branch || "",
      ifsc: userInfo.ifsc || "",
      cheque: userInfo.cheque || "",
      logo: userInfo.logo || "",
      positionId: userInfo.positionId || "",
      positionName: userInfo.positionName || "",
      departmentId: userInfo.departmentId || "",
      departmentName: userInfo.departmentName || "",
      sectorId: userInfo.sectorId || "",
      sectorName: userInfo.sectorName || "",
    };
    return res.status(200).json({ data: myObj });
  } catch (err) {
    console.error("Error in viewUsersData:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
