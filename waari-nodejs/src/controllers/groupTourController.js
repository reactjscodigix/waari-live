// controllers/groupTourController.js
const db = require("../../db");
const CommonController = require("../controllers/CommonController");
const dayjs = require("dayjs");
const moment = require("moment");
const Joi = require("joi"); // for validation
const { token } = require("morgan");
const pool = require("../../db");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const { body, validationResult } = require("express-validator");
exports.listGroupTour = async (req, res) => {
  try {
    // ✅ Token check
    const tokenData = await CommonController.checkToken(
      req.headers["token"],
      [26, 118]
    );
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const { startDate, endDate, search, tourName, perPage, page } = req.query;

    const limit = perPage ? parseInt(perPage) : 10;
    const currentPage = page ? parseInt(page) : 1;
    const offset = (currentPage - 1) * limit;

    // ✅ Base query
    let baseQuery = `
      FROM enquirygrouptours eg
      JOIN grouptours g ON eg.groupTourId = g.groupTourId
      WHERE eg.enquiryProcess = 1
        AND DATE(eg.nextFollowUp) = CURDATE()
        AND TIME(eg.nextFollowUpTime) > CURTIME()
        AND eg.createdBy = ?
    `;
    let params = [tokenData.userId];

    // ✅ Filtering
    if (startDate && endDate) {
      baseQuery += " AND g.startDate >= ? AND g.endDate <= ?";
      params.push(startDate, endDate);
    } else if (startDate) {
      baseQuery += " AND g.startDate >= ?";
      params.push(startDate);
    } else if (endDate) {
      baseQuery += " AND g.endDate <= ?";
      params.push(endDate);
    } else if (search) {
      baseQuery += " AND CONCAT(eg.firstName, ' ', eg.lastName) LIKE ?";
      params.push(`%${search}%`);
    } else if (tourName) {
      baseQuery += " AND g.tourName LIKE ?";
      params.push(`%${tourName}%`);
    }

    // ✅ Data query
    const dataQuery = `
      SELECT 
        eg.*, g.tourName, g.startDate, g.endDate
      ${baseQuery}
      ORDER BY eg.nextFollowUpTime ASC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];

    // ✅ Count query
    const countQuery = `
      SELECT COUNT(*) as total
      ${baseQuery}
    `;

    db.query(dataQuery, dataParams, (err, results) => {
      if (err) {
        console.error("listGroupTour Data Error:", err);
        return res.status(500).json({ error: "Database query error" });
      }

      db.query(countQuery, params, (countErr, countResult) => {
        if (countErr) {
          console.error("listGroupTour Count Error:", countErr);
          return res.status(500).json({ error: "Database count error" });
        }

        const total = countResult[0].total;

        // ✅ Format response
        const data = results.map((value) => ({
          enquiryGroupId: value.enquiryGroupId,
          enquiryDate: value.created_at
            ? new Date(value.created_at).toISOString().split("T")[0]
            : null,
          groupName: value.groupName,
          guestName: `${value.firstName} ${value.lastName}`,
          uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
          contact: value.contact,
          tourName: value.tourName,
          startDate: value.startDate,
          endDate: value.endDate,
          paxNo: (value.adults || 0) + (value.child || 0),
          lastFollowUp: value.created_at
            ? new Date(value.created_at).toISOString().split("T")[0]
            : null,
          nextFollowUp: value.nextFollowUp
            ? new Date(value.nextFollowUp).toISOString().split("T")[0]
            : null,
          nextFollowUpTime: value.nextFollowUpTime,
          userName: tokenData.userName,
        }));

        return res.json({
          data,
          total,
          currentPage,
          perPage: limit,
          lastPage: Math.ceil(total / limit),
        });
      });
    });
  } catch (error) {
    console.error("listGroupTour Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
exports.lostEnquiryGroupTour = async (req, res) => {
  try {
    // Token validation
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [106]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // For testing, override userId to 18 (matches your data)
    const userId = 18; // tokenData.userId;

    let { guestName, perPage, page } = req.query;
    perPage = perPage ? parseInt(perPage) : 10;
    page = page ? parseInt(page) : 1;
    const offset = (page - 1) * perPage;

    // Base query with LEFT JOIN
    let baseQuery = `
      FROM enquirygrouptours egt
      LEFT JOIN grouptours gt ON egt.groupTourId = gt.groupTourId
      WHERE egt.enquiryProcess = 3
      AND egt.createdBy = ?
    `;
    const queryParams = [userId];

    if (guestName && guestName.trim() !== "") {
      baseQuery += ` AND CONCAT(egt.firstName, ' ', egt.lastName) LIKE ? `;
      queryParams.push(`%${guestName}%`);
    }

    // Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total ${baseQuery}`,
      queryParams
    );
    const total = countRows[0].total;

    // Paginated query
    const [rows] = await db.query(
      `SELECT egt.*, gt.tourName, gt.destinationId ${baseQuery} ORDER BY egt.enquiryGroupId DESC LIMIT ? OFFSET ?`,
      [...queryParams, perPage, offset]
    );

    // Format response
    const lostGroupArray = rows.map((value) => ({
      enquiryId: value.enquiryId
        ? value.enquiryId.toString().padStart(4, "0")
        : null,
      enquiryDate: value.created_at
        ? new Date(value.created_at).toLocaleDateString("en-GB")
        : null,
      guestName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
      contactNo: value.contact || null,
      destination: value.destinationId
        ? value.destinationId == 1
          ? "Domestic"
          : "International"
        : null,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: value.nextFollowUp
        ? new Date(value.nextFollowUp).toLocaleDateString("en-GB")
        : null,
      closureReason: value.closureReason || null,
    }));

    return res.status(200).json({
      data: lostGroupArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/lost-enquiry-group-tour?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/lost-enquiry-group-tour?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error in lostEnquiryGroupTour:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ Upcoming List Group Tour
exports.upcomingListGroupTour = async (req, res) => {
  try {
    // check token
    const tokenResult = await CommonController.checkToken(
      req.headers["token"],
      [26, 118]
    );
    console.log("Received token:", req.headers["token"]);
    // console.log(tokenResult)

    if (tokenResult.status !== 200) {
      return res
        .status(tokenResult.status)
        .json({ message: tokenResult.message });
    }

    // ✅ extract user info
    const user = tokenResult.data;

    const today = moment().format("YYYY-MM-DD");

    let query = `
      SELECT e.*, g.tourName, g.startDate, g.endDate
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      WHERE e.enquiryProcess = 1
        AND e.nextFollowUp > ?
        AND e.createdBy = ?
    `;

    let params = [today, user.userId];

    // ✅ Filters
    if (req.query.startDate && req.query.endDate) {
      query += " AND g.startDate >= ? AND g.endDate <= ?";
      params.push(
        moment(req.query.startDate)
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss"),
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    } else if (req.query.startDate) {
      query += " AND g.startDate >= ?";
      params.push(
        moment(req.query.startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    } else if (req.query.endDate) {
      query += " AND g.endDate <= ?";
      params.push(
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    if (req.query.search) {
      query +=
        " AND CONCAT(IFNULL(e.firstName,''), ' ', IFNULL(e.lastName,'')) LIKE ?";
      params.push(`%${req.query.search}%`);
    }

    if (req.query.tourName) {
      query += " AND g.tourName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    query += " ORDER BY e.nextFollowUp ASC, e.nextFollowUpTime ASC";

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * perPage;

    const [data] = await db.query(query + " LIMIT ? OFFSET ?", [
      ...params,
      perPage,
      offset,
    ]);
    const [totalResult] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as countTable`,
      params
    );

    let groupTourArray = data.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
      enquiryDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      tourName: value.tourName,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      paxNo: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      remark: value.remark,
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: user.userName, // ✅ use from token
    }));

    res.json({
      data: groupTourArray,
      total: totalResult[0].total,
      currentPage,
      perPage,
      nextPageUrl:
        currentPage < Math.ceil(totalResult[0].total / perPage)
          ? currentPage + 1
          : null,
      previousPageUrl: currentPage > 1 ? currentPage - 1 : null,
      lastPage: Math.ceil(totalResult[0].total / perPage),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// confirm group tour db.listenerCount
exports.getAllConfirmGroupTourList = async (req, res) => {
  try {
    const token = req.headers["token"];

    // 🔐 1. Check token and permissions
    const tokenData = await CommonController.checkToken(token, [211]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // 📥 2. Extract query parameters
    const {
      startDate,
      endDate,
      guestName,
      tourName,
      page = 1,
      perPage = 10,
    } = req.query;
    const limit = Number(perPage) || 10;
    const offset = (Number(page) - 1) * limit;

    // 🛠️ 3. Base query
    let query = `
      SELECT 
        enquiryGroupId,
        familyHeadNo,  -- ✅ fixed column name
        groupName AS tourName,
        firstName,
        lastName,
        contact AS phoneNo,
        created_at AS startDate,   -- adjust if real startDate exists
        updated_at AS endDate,     -- adjust if real endDate exists
        0 AS tourPrice,            -- placeholder, join pricing table if needed
        0 AS additionalDis,
        0 AS discountPrice,
        0 AS gst,
        0 AS tcs,
        0 AS grandTotal,
        0 AS advancePayment,
        0 AS balance,
        enquiryId
      FROM enquirygrouptours
      WHERE 1=1
    `;

    const queryParams = [];

    // 📅 4. Date filtering
    if (startDate && endDate) {
      query += ` AND created_at >= ? AND updated_at <= ? `;
      queryParams.push(
        dayjs(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss"),
        dayjs(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    } else if (startDate) {
      query += ` AND created_at >= ? `;
      queryParams.push(
        dayjs(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    } else if (endDate) {
      query += ` AND updated_at <= ? `;
      queryParams.push(
        dayjs(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // 👥 5. Guest name search
    if (guestName) {
      query += ` AND CONCAT(firstName, ' ', lastName) LIKE ? `;
      queryParams.push(`%${guestName}%`);
    }

    // 🚌 6. Tour name search
    if (tourName) {
      query += ` AND groupName LIKE ? `;
      queryParams.push(`%${tourName}%`);
    }

    // ➕ 7. Add pagination
    const paginatedQuery = `${query} LIMIT ? OFFSET ?`;
    const paginatedParams = [...queryParams, limit, offset];

    // 📊 8. Execute main query
    const [rows] = await db.query(paginatedQuery, paginatedParams);

    // 🧮 9. Count total matching records
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const [countResult] = await db.query(countQuery, queryParams);

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    const currentPage = Number(page);

    // 📦 10. Format response data
    const data = rows.map((row) => ({
      enquiryGroupId: row.enquiryGroupId,
      familyHeadNo: row.familyHeadNo,
      tourName: row.tourName,
      guestName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
      startDate: row.startDate,
      endDate: row.endDate,
      contact: row.phoneNo,
      tourPrice: Number(row.tourPrice) || 0,
      discount: Number(row.additionalDis) || 0,
      discounted: Number(row.discountPrice) || 0,
      gst: Number(row.gst) || 0,
      tcs: Number(row.tcs) || 0,
      grand: Number(row.grandTotal) || 0,
      advancePayment: Number(row.advancePayment) || 0,
      balance: Math.round(Number(row.balance) * 100) / 100,
      uniqueEnquiryId: String(row.enquiryId || "").padStart(4, "0"),
    }));

    // 📤 11. Send final paginated response
    return res.status(200).json({
      data,
      total,
      currentPage,
      perPage: limit,
      nextPageUrl:
        currentPage < totalPages
          ? `/confirm-group-tour-list?page=${currentPage + 1}&perPage=${limit}`
          : null,
      previousPageUrl:
        currentPage > 1
          ? `/confirm-group-tour-list?page=${currentPage - 1}&perPage=${limit}`
          : null,
      lastPage: totalPages,
    });
  } catch (error) {
    console.error("Error in getAllConfirmGroupTourList:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.allConfirmCustomList = async (req, res) => {
  try {
    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [249]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination setup
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // ✅ Base query & filters
    let whereClauses = [
      `enquirycustomtours.enquiryProcess = 2`,
      `customtourdiscountdetails.invoiceNo IS NULL`,
    ];
    let params = [];

    if (req.query.startDate && req.query.endDate) {
      const startDate = moment(req.query.startDate)
        .startOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      const endDate = moment(req.query.endDate)
        .endOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      whereClauses.push(
        `customtourenquirydetails.startDate >= ? AND customtourenquirydetails.endDate <= ?`
      );
      params.push(startDate, endDate);
    } else if (req.query.startDate) {
      const startDate = moment(req.query.startDate)
        .startOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      whereClauses.push(`customtourenquirydetails.startDate >= ?`);
      params.push(startDate);
    } else if (req.query.endDate) {
      const endDate = moment(req.query.endDate)
        .endOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      whereClauses.push(`customtourenquirydetails.endDate <= ?`);
      params.push(endDate);
    }

    if (req.query.tourName) {
      whereClauses.push(`enquirycustomtours.groupName LIKE ?`);
      params.push(`%${req.query.tourName}%`);
    }

    const whereSQL = whereClauses.length
      ? "WHERE " + whereClauses.join(" AND ")
      : "";

    // ✅ Count query for pagination
    const [countRows] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM enquirycustomtours
      JOIN customtourenquirydetails ON enquirycustomtours.enquiryCustomId = customtourenquirydetails.enquiryCustomId
      JOIN customtourdiscountdetails ON enquirycustomtours.enquiryCustomId = customtourdiscountdetails.enquiryCustomId
      ${whereSQL}
      `,
      params
    );
    const total = countRows[0].total;

    // ✅ Data query
    const [rows] = await db.query(
      `
      SELECT 
        enquirycustomtours.enquiryCustomId,
        enquirycustomtours.enquiryId,
        enquirycustomtours.groupName,
        customtourenquirydetails.firstName,
        customtourenquirydetails.lastName,
        customtourdiscountdetails.phoneNo, 
        enquirycustomtours.destinationId,   
        customtourenquirydetails.paxPerHead,     
        enquirycustomtours.startDate,       
        enquirycustomtours.endDate,         
        enquirycustomtours.days,            
        enquirycustomtours.nights   
      FROM enquirycustomtours
      JOIN customtourenquirydetails ON enquirycustomtours.enquiryCustomId = customtourenquirydetails.enquiryCustomId
      JOIN customtourdiscountdetails ON enquirycustomtours.enquiryCustomId = customtourdiscountdetails.enquiryCustomId
      ${whereSQL}
      LIMIT ? OFFSET ?
      `,
      [...params, perPage, offset]
    );

    // ✅ Format response
    const data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      groupName: value.groupName,
      guestName: `${value.firstName} ${value.lastName}`,
      phoneNo: value.phoneNo,
      destination: value.destinationId == 1 ? "Domestic" : "International",
      pax: value.paxPerHead,
      startDate: value.startDate,
      endDate: value.endDate,
      duration: `${value.days}D-${value.nights}N`,
    }));

    return res.json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/confirm-custom-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/confirm-custom-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("❌ Error in allConfirmCustomList:", error);
    return res
      .status(500)
      .json({ message: "Server Error", error: error.message });
  }
};

// GET /guest-detail-gt-list
exports.guestDetailGroupTourList = async (req, res) => {
  try {
    // ✅ Check token & permissions
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      317,
    ]);

    if (tokenData.error) return res.status(401).json(tokenData);

    const userId = tokenData.userId;

    // ✅ Pagination params
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query (removed createdBy filter to show all data)
    let sql = `
      SELECT *
      FROM grouptourguestdetails
      WHERE 1=1
    `;
    let params = [];

    // ✅ If you still want to filter only user’s data, uncomment below:
    // sql += " AND createdBy = ?";
    // params.push(userId);

    // ✅ Optional filter by guestId
    if (req.query.guestId && req.query.guestId.trim() !== "") {
      const [familyHeads] = await db.query(
        `SELECT familyHeadGtId 
         FROM grouptourfamilyheaddetails 
         WHERE guestId LIKE ? 
         ORDER BY created_at DESC`,
        [`%${req.query.guestId}%`]
      );

      if (familyHeads.length > 0) {
        const ids = familyHeads.map((fh) => fh.familyHeadGtId);
        sql += ` AND familyHeadGtId IN (?)`;
        params.push(ids);
      } else {
        return res.json({
          message: `No records found for guestId = ${req.query.guestId}`,
          data: [],
        });
      }
    }

    // ✅ Total count for pagination
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total 
       FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0].total;

    if (total === 0) {
      return res.json({ message: "No guest details found", data: [] });
    }

    // ✅ Final query with order & limit
    sql += ` ORDER BY groupGuestDetailId DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    // ✅ Format response like Laravel
    const guestDetailGroupTourArray = rows.map((value) => ({
      groupGuestDetailId: value.groupGuestDetailId,
      firstName: value.firstName,
      lastName: value.lastName,
      gender: value.gender,
      contact: value.contact,
      familyHeadGtId: value.familyHeadGtId,
      enquiryGroupId: value.enquiryGroupId,
      guestId: value.guestId,
    }));

    return res.json({
      data: guestDetailGroupTourArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/guest-detail-gt-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/guest-detail-gt-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in guestDetailGroupTourList:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /all-guest-detail-gt-list
exports.allGuestDetailGroupTourList = async (req, res) => {
  try {
    // ✅ Check token & permissions
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      316,
    ]);

    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination params
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query (NO createdBy filter)
    let sql = `
      SELECT *
      FROM grouptourguestdetails
      WHERE 1 = 1
    `;
    let params = [];

    // ✅ Optional filter by guestId
    if (req.query.guestId && req.query.guestId.trim() !== "") {
      const [familyHeads] = await db.query(
        `SELECT familyHeadGtId 
         FROM grouptourfamilyheaddetails 
         WHERE guestId LIKE ? 
         ORDER BY created_at DESC`,
        [`%${req.query.guestId}%`]
      );

      if (familyHeads.length > 0) {
        const ids = familyHeads.map((fh) => fh.familyHeadGtId);
        sql += ` AND familyHeadGtId IN (?)`;
        params.push(ids);
      }
    }

    // ✅ Total count for pagination
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total 
       FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0].total;

    // ✅ Final query with order & limit
    sql += ` ORDER BY groupGuestDetailId DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    // ✅ Format response like Laravel
    const guestDetailGroupTourArray = rows.map((value) => ({
      groupGuestDetailId: value.groupGuestDetailId,
      firstName: value.firstName,
      lastName: value.lastName,
      gender: value.gender,
      contact: value.contact,
      familyHeadGtId: value.familyHeadGtId,
      enquiryGroupId: value.enquiryGroupId,
      guestId: value.guestId,
    }));

    return res.json({
      data: guestDetailGroupTourArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-guest-detail-gt-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-guest-detail-gt-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in allGuestDetailGroupTourList:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /guest-detail-ct-list
// GET /guest-detail-ct-list
exports.guestDetailCustomTourList = async (req, res) => {
  try {
    // ✅ Check token with permission [318]
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      318,
    ]);

    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination setup
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query (removed strict createdBy filter)
    let sql = `
      SELECT *
      FROM customtourguestdetails
      WHERE 1=1
    `;
    let params = [];

    // ✅ If you still want to filter by createdBy (only if passed explicitly)
    if (req.query.createdBy) {
      sql += ` AND createdBy = ?`;
      params.push(req.query.createdBy);
    }

    // ✅ Optional filter by guestId
    if (req.query.guestId && req.query.guestId.trim() !== "") {
      const [enquiryDetailCustomIds] = await db.query(
        `SELECT enquiryDetailCustomId 
         FROM customtourenquirydetails 
         WHERE guestId LIKE ? 
         ORDER BY created_at DESC`,
        [`%${req.query.guestId}%`]
      );

      if (enquiryDetailCustomIds.length > 0) {
        const ids = enquiryDetailCustomIds.map(
          (row) => row.enquiryDetailCustomId
        );
        sql += ` AND enquiryDetailCustomId IN (?)`;
        params.push(ids);
      }
    }

    // ✅ Total count
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0].total;

    // ✅ Final query with sorting & pagination
    sql += ` ORDER BY customGuestDetailsId DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    // ✅ Format response like Laravel
    const guestDetailCustomTourArray = rows.map((value) => ({
      customGuestDetailsId: value.customGuestDetailsId,
      firstName: value.firstName,
      lastName: value.lastName,
      gender: value.gender,
      contact: value.contact,
      enquiryDetailCustomId: value.enquiryDetailCustomId,
      enquiryCustomId: value.enquiryCustomId,
      guestId: value.guestId,
    }));

    return res.json({
      data: guestDetailCustomTourArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/guest-detail-ct-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/guest-detail-ct-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in guestDetailCustomTourList:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /all-guest-detail-ct-list
exports.allGuestDetailCustomTourList = async (req, res) => {
  try {
    // ✅ Check token with permission [315]
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      315,
    ]);

    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination setup
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query (no createdBy filter here)
    let sql = `
      SELECT *
      FROM customtourguestdetails
      WHERE 1=1
    `;
    let params = [];

    // ✅ Optional filter by guestId
    if (req.query.guestId && req.query.guestId.trim() !== "") {
      const [enquiryDetailCustomIds] = await db.query(
        `SELECT enquiryDetailCustomId 
         FROM customtourenquirydetails 
         WHERE guestId LIKE ? 
         ORDER BY created_at DESC`,
        [`%${req.query.guestId}%`]
      );

      if (enquiryDetailCustomIds.length > 0) {
        const ids = enquiryDetailCustomIds.map(
          (row) => row.enquiryDetailCustomId
        );
        sql += ` AND enquiryDetailCustomId IN (?)`;
        params.push(ids);
      }
    }

    // ✅ Total count
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0].total;

    // ✅ Final query with sorting & pagination
    sql += ` ORDER BY customGuestDetailsId DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    // ✅ Format response
    const guestDetailCustomTourArray = rows.map((value) => ({
      customGuestDetailsId: value.customGuestDetailsId,
      firstName: value.firstName,
      lastName: value.lastName,
      gender: value.gender,
      contact: value.contact,
      enquiryDetailCustomId: value.enquiryDetailCustomId,
      enquiryCustomId: value.enquiryCustomId,
      guestId: value.guestId,
    }));

    return res.json({
      data: guestDetailCustomTourArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-guest-detail-ct-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-guest-detail-ct-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in allGuestDetailCustomTourList:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /booking-records
exports.bookingRecords = async (req, res) => {
  try {
    // ✅ Token check with permission [94]
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      94,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination setup
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query (removed strict createdBy filter, made optional)
    let sql = `
      SELECT cgt.*, tt.tourTypeName
      FROM enquirygrouptours cgt
      LEFT JOIN tourtype tt ON cgt.groupTourId = tt.tourTypeId
      WHERE 1=1
    `;
    const params = [];

    // 🔹 Optional createdBy filter (if passed in query OR if you want to enforce per user)
    if (req.query.createdBy) {
      sql += ` AND cgt.createdBy = ?`;
      params.push(req.query.createdBy);
    }

    // ✅ Guest name filter
    if (req.query.guestName && req.query.guestName.trim() !== "") {
      sql += ` AND CONCAT(cgt.firstName, ' ', cgt.lastName) LIKE ?`;
      params.push(`%${req.query.guestName}%`);
    }

    // ✅ Tour name filter → use groupName instead
    if (req.query.tourName && req.query.tourName.trim() !== "") {
      sql += ` AND cgt.groupName LIKE ?`;
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Tour type filter
    if (req.query.tourTypeId && req.query.tourTypeId.trim() !== "") {
      sql += ` AND tt.tourTypeId = ?`;
      params.push(req.query.tourTypeId);
    }

    // ✅ Destination filter (only if you have a destinationId column)
    if (req.query.destinationId && req.query.destinationId.trim() !== "") {
      sql += ` AND cgt.destinationId = ?`;
      params.push(req.query.destinationId);
    }

    // ✅ Booking date filter using created_at
    if (req.query.bookingDate && req.query.bookingDate.trim() !== "") {
      sql += ` AND DATE(cgt.created_at) = ?`;
      params.push(req.query.bookingDate);
    }

    // ✅ Count total matching records
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0]?.total || 0;

    // ✅ Add pagination
    sql += ` ORDER BY cgt.enquiryGroupId DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    // ✅ Format response
    const bookingRecordsArray = rows.map((row) => ({
      enquiryId: row.enquiryGroupId,
      familyHeadNo: row.familyHeadNo,
      uniqueEnqueryId: String(row.enquiryId || "").padStart(4, "0"),
      guestName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
      contact: row.contact,
      tourType: row.tourTypeName,
      tourName: row.groupName,
      pax: (row.adults || 0) + (row.child || 0),
      bookingDate: row.created_at
        ? dayjs(row.created_at).format("YYYY-MM-DD")
        : null,
      travelDate: row.travelDate || row.created_at, // if you have travelDate column
    }));

    // ✅ Send response
    return res.json({
      data: bookingRecordsArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/booking-records?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/booking-records?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in bookingRecords:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /booking-record-ct
exports.bookingRecordsCt = async (req, res) => {
  try {
    // ✅ Token check with permission [97]
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      97,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    let sql = `
      SELECT 
        ect.enquiryCustomId,
        ect.enquiryId,
        ect.groupName,
        ect.adults,
        ect.child,
        ect.startDate,
        ect.endDate,
        ect.days,
        ect.nights,
        ect.createdBy,
        ect.enquiryProcess,
        ect.created_at AS enquiryCreatedAt,

        ctd.enquiryDetailCustomId,
        ctd.billingName,
        ctd.phoneNo,  
        ctd.grandTotal,
        ctd.invoiceNo,
        ctd.created_at AS discountCreatedAt,

        dd.destinationName
      FROM customtourenquirydetails cted
      LEFT JOIN customtourdiscountdetails ctd 
        ON cted.enquiryDetailCustomId = ctd.enquiryDetailCustomId
      LEFT JOIN enquirycustomtours ect
        ON cted.enquiryCustomId = ect.enquiryCustomId
      LEFT JOIN dropdowndestination dd 
        ON ect.destinationId = dd.destinationId
      WHERE 1=1
    `;

    let params = [];

    // ✅ Optional filters
    if (req.query.startDate && req.query.endDate) {
      sql += ` AND ect.startDate >= ? AND ect.endDate <= ?`;
      params.push(req.query.startDate, req.query.endDate);
    }
    if (req.query.guestName) {
      sql += ` AND ctd.billingName LIKE ?`;
      params.push(`%${req.query.guestName}%`);
    }
    if (req.query.groupName) {
      sql += ` AND ect.groupName LIKE ?`;
      params.push(`%${req.query.groupName}%`);
    }
    if (req.query.destinationId) {
      sql += ` AND dd.destinationId = ?`;
      params.push(req.query.destinationId);
    }

    // ✅ Count query
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0].total;

    // ✅ Add pagination
    sql += ` ORDER BY ect.created_at DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    const bookingRecordsArray = rows.map((value) => ({
      enquiryId: value.enquiryCustomId,
      uniqueEnqueryId: value.enquiryId
        ? String(value.enquiryId).padStart(4, "0")
        : null,
      enquiryDetailCustomId: value.enquiryDetailCustomId,
      guestName: value.billingName || "",
      phoneNo: value.phoneNo || "",
      tourType: value.destinationName || "",
      tourName: value.groupName || "",
      pax: (value.adults || 0) + (value.child || 0),
      bookingDate: value.discountCreatedAt
        ? dayjs(value.discountCreatedAt).format("YYYY-MM-DD")
        : null,
      travelDate: value.startDate || null,
      duration:
        value.days && value.nights ? `${value.days}D-${value.nights}N` : null,
    }));

    return res.json({
      data: bookingRecordsArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/booking-record-ct?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/booking-record-ct?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in bookingRecordsCt:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /all-booking-records-gt

exports.allBookingRecordsGt = async (req, res) => {
  try {
    // ✅ Token check with permission [224]
    const tokenData = await CommonController.checkToken(req.headers.token, [
      224,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    let { guestName, tourName, tourTypeId, perPage, page } = req.query;

    perPage = perPage ? parseInt(perPage) : 10;
    page = page ? parseInt(page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query: join with tourtype if you want tourType name
    let sql = `
      SELECT egt.*, tt.tourTypeName
      FROM enquirygrouptours egt
      LEFT JOIN tourtype tt ON egt.groupTourId = tt.tourTypeId
      WHERE 1=1
    `;
    const params = [];

    // ✅ Filters
    if (guestName && guestName.trim() !== "") {
      sql += ` AND CONCAT(egt.firstName, ' ', egt.lastName) LIKE ?`;
      params.push(`%${guestName}%`);
    }

    if (tourName && tourName.trim() !== "") {
      sql += ` AND egt.groupName LIKE ?`;
      params.push(`%${tourName}%`);
    }

    if (tourTypeId && tourTypeId.trim() !== "") {
      sql += ` AND egt.groupTourId = ?`;
      params.push(tourTypeId);
    }

    // Optional: fetch only user's own records OR show all
    // sql += ` AND (egt.createdBy = ? OR egt.createdBy IS NULL)`;
    // params.push(tokenData.userId);

    // ✅ Count total matching records
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${sql}) as subquery`,
      params
    );
    const total = countRows[0]?.total || 0;

    // ✅ Add pagination
    sql += ` ORDER BY egt.enquiryGroupId DESC LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    const [rows] = await db.query(sql, params);

    // ✅ Format response
    const bookingRecordsArray = rows.map((row) => ({
      enquiryId: row.enquiryGroupId,
      uniqueEnqueryId: String(row.enquiryId || "").padStart(4, "0"),
      guestName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
      tourName: row.groupName,
      tourType: row.tourTypeName,
      pax: (row.adults || 0) + (row.child || 0),
      bookingDate: row.created_at
        ? dayjs(row.created_at).format("YYYY-MM-DD")
        : null,
      travelDate: row.travelDate || null, // if travelDate exists
    }));

    return res.json({
      data: bookingRecordsArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-booking-records-gt?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-booking-records-gt?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in allBookingRecordsGt:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /all-booking-records-ct
exports.allBookingRecordCt = async (req, res) => {
  try {
    // 🔑 Token check
    const tokenData = await CommonController.checkToken(req.headers.token, [
      261,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    let {
      startDate,
      endDate,
      guestName,
      groupName,
      destinationId,
      bookingDate,
      perPage,
      page,
    } = req.query;

    perPage = perPage ? parseInt(perPage) : 10;
    page = page ? parseInt(page) : 1;
    const offset = (page - 1) * perPage;

    let conditions = [];
    let params = [];

    // 🔎 Optional filters
    if (startDate) {
      conditions.push(`ect.startDate >= ?`);
      params.push(
        moment(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }
    if (endDate) {
      conditions.push(`ect.endDate <= ?`);
      params.push(moment(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss"));
    }
    if (guestName) {
      conditions.push(`ctd.billingName LIKE ?`);
      params.push(`%${guestName}%`);
    }
    if (groupName) {
      conditions.push(`ect.groupName LIKE ?`);
      params.push(`%${groupName}%`);
    }
    if (destinationId) {
      conditions.push(`dd.destinationId = ?`);
      params.push(destinationId);
    }
    if (bookingDate) {
      conditions.push(`DATE(ctd.created_at) = ?`);
      params.push(moment(bookingDate).format("YYYY-MM-DD"));
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // 📌 Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM customtourenquirydetails cted
       LEFT JOIN customtourdiscountdetails ctd
         ON cted.enquiryDetailCustomId = ctd.enquiryDetailCustomId
       LEFT JOIN enquirycustomtours ect
         ON cted.enquiryCustomId = ect.enquiryCustomId
       LEFT JOIN dropdowndestination dd
         ON ect.destinationId = dd.destinationId
       ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // 📌 Fetch paginated records
    const [rows] = await db.query(
      `SELECT ect.*, ctd.billingName, ctd.phoneNo, ctd.grandTotal, ctd.invoiceNo, ctd.created_at AS discountCreatedAt, dd.destinationName, cted.enquiryDetailCustomId
       FROM customtourenquirydetails cted
       LEFT JOIN customtourdiscountdetails ctd
         ON cted.enquiryDetailCustomId = ctd.enquiryDetailCustomId
       LEFT JOIN enquirycustomtours ect
         ON cted.enquiryCustomId = ect.enquiryCustomId
       LEFT JOIN dropdowndestination dd
         ON ect.destinationId = dd.destinationId
       ${whereClause}
       ORDER BY ect.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    const bookingRecordsArray = rows.map((row) => ({
      enquiryId: row.enquiryCustomId,
      uniqueEnqueryId: row.enquiryId
        ? String(row.enquiryId).padStart(4, "0")
        : null,
      enquiryDetailCustomId: row.enquiryDetailCustomId,
      guestName: row.billingName || "",
      phoneNo: row.phoneNo || "",
      tourType: row.destinationName || "",
      tourName: row.groupName || "",
      pax: (row.adults || 0) + (row.child || 0),
      bookingDate: row.discountCreatedAt
        ? dayjs(row.discountCreatedAt).format("YYYY-MM-DD")
        : null,
      travelDate: row.startDate || null,
      duration: row.days && row.nights ? `${row.days}D-${row.nights}N` : null,
    }));

    return res.json({
      data: bookingRecordsArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-booking-records-ct?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-booking-records-ct?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ Error in allBookingRecordsCt:", err);
    return res.status(500).json({ error: err.message });
  }
};

// controllers/RoleManagementController.js
exports.futureEnquiryAllListing = async (req, res) => {
  try {
    // ✅ Check token
    const tokenResult = await CommonController.checkToken(
      req.headers["token"],
      [135]
    );
    if (tokenResult.status !== 200) {
      return res.status(401).json({
        message: tokenResult.message || "Invalid token",
      });
    }

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let sql =
      "SELECT SQL_CALC_FOUND_ROWS * FROM futuretourenquirydetails WHERE 1=1";
    const params = [];

    // ✅ Searching
    if (req.query.name) {
      sql += " AND name LIKE ?";
      params.push(`%${req.query.name}%`);
    }
    if (req.query.city) {
      sql += " AND city LIKE ?";
      params.push(`%${req.query.city}%`);
    }
    if (req.query.phoneNo) {
      sql += " AND phoneNo LIKE ?";
      params.push(`%${req.query.phoneNo}%`);
    }

    // ✅ Ordering + Limit
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    // ✅ Execute query
    const [rows] = await db.query(sql, params);
    const [totalResult] = await db.query("SELECT FOUND_ROWS() as total");
    const total = totalResult[0].total;

    // ✅ Format result
    const allEnquiriesArray = rows.map((value) => ({
      futureEnqId: value.futureEnqId,
      name: value.name,
      city: value.city ? JSON.parse(value.city) : null,
      phoneNo: value.phoneNo,
      address: value.address,
      email: value.email,
      startDate: value.startDate,
      endDate: value.endDate,
      // status: value.status,
      // statusDescription: "0-inactive,1-active",
    }));

    return res.status(200).json({
      data: allEnquiriesArray,
      total: total,
      currentPage: page,
      perPage: perPage,
      nextPageUrl:
        page * perPage < total
          ? `/future-enquiry-all-listing?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/future-enquiry-all-listing?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("❌ Error in futureEnquiryAllListing:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.futureEnquirySelfListing = async (req, res) => {
  try {
    console.log("➡️ Request received for /future-enquiry-self-listing");

    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [136]);

    if (tokenData.status !== 200) {
      return res.status(tokenData.status).json({ message: tokenData.message });
    }

    const user = tokenData.data;

    let { page, perPage, name, city, phoneNo } = req.query;
    page = parseInt(page) || 1;
    perPage = parseInt(perPage) || 10;
    const offset = (page - 1) * perPage;

    // Base query
    let query = "SELECT * FROM futuretourenquirydetails WHERE createdBy = ?";
    const params = [user.userId];

    // Search filters
    if (name) {
      query += " AND name LIKE ?";
      params.push(`%${name}%`);
    }
    if (city) {
      query += " AND city LIKE ?";
      params.push(`%${city}%`);
    }
    if (phoneNo) {
      query += " AND phoneNo LIKE ?";
      params.push(`%${phoneNo}%`);
    }

    // Count total
    const [totalResults] = await db.query(
      "SELECT COUNT(*) as total FROM (" + query + ") AS countTable",
      params
    );
    const total = totalResults[0].total;

    // Add ordering and pagination
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // Transform city from JSON string to array
    const data = rows.map((row) => ({
      futureEnqId: row.futureEnqId,
      name: row.name,
      city: JSON.parse(row.city || "[]"),
      phoneNo: row.phoneNo,
      address: row.address,
      email: row.email,
      startDate: row.startDate,
      endDate: row.endDate,
    }));

    // Pagination info
    const lastPage = Math.ceil(total / perPage);
    const nextPage = page < lastPage ? page + 1 : null;
    const previousPage = page > 1 ? page - 1 : null;

    return res.status(200).json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPage,
      previousPage,
      lastPage,
    });
  } catch (error) {
    console.error("❌ Error in futureEnquirySelfListing:", error);
    return res.status(500).json({ message: error.message });
  }
};
// controllers/AccountController.js

exports.payPendingList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenResult = await CommonController.checkToken(
      req.headers["token"],
      [44]
    );
    if (tokenResult.error) return res.status(401).json(tokenResult);

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let baseSql = `
      FROM grouptourpaymentdetails
      LEFT JOIN grouptourdiscountdetails 
        ON grouptourpaymentdetails.groupDisId = grouptourdiscountdetails.groupDisId
      LEFT JOIN enquirygrouptours 
        ON grouptourpaymentdetails.enquiryGroupId = enquirygrouptours.enquiryGroupId
      LEFT JOIN grouptourfamilyheaddetails 
        ON grouptourpaymentdetails.familyHeadGtId = grouptourfamilyheaddetails.familyHeadGtId
      LEFT JOIN grouptours 
        ON enquirygrouptours.groupTourId = grouptours.groupTourId
      WHERE grouptourpaymentdetails.status = 0
        AND enquirygrouptours.enquiryProcess = 2
    `;

    const params = [];

    // ✅ Date filters
    if (req.query.startDate && req.query.endDate) {
      baseSql += " AND grouptours.startDate >= ? AND grouptours.endDate <= ?";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      baseSql += " AND grouptours.startDate >= ?";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      baseSql += " AND grouptours.endDate <= ?";
      params.push(req.query.endDate);
    }

    // ✅ Tour name filter
    if (req.query.tourName) {
      baseSql += " AND grouptours.tourName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Guest name filter
    if (req.query.guestName) {
      baseSql +=
        " AND CONCAT(grouptourfamilyheaddetails.firstName, ' ', grouptourfamilyheaddetails.lastName) LIKE ?";
      params.push(`%${req.query.guestName}%`);
    }

    // ✅ Count query
    const countSql = `SELECT COUNT(*) as total ${baseSql}`;
    const [countRows] = await db.query(countSql, params);
    const total = countRows[0].total;

    // ✅ Data query
    const dataSql = `
      SELECT 
        grouptours.tourName,
        grouptours.startDate,
        grouptours.endDate,
        enquirygrouptours.enquiryGroupId,
        enquirygrouptours.enquiryId,
        enquirygrouptours.contact,
        enquirygrouptours.created_at,
        grouptourfamilyheaddetails.firstName,
        grouptourfamilyheaddetails.lastName,
        grouptourdiscountdetails.additionalDis,
        grouptourdiscountdetails.discountPrice,
        grouptourpaymentdetails.*
      ${baseSql}
      ORDER BY enquirygrouptours.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(dataSql, [...params, perPage, offset]);

    // ✅ Format results
    const pendingListArray = rows.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      uniqueEnqueryId: String(value.enquiryId || "").padStart(4, "0"),
      familyHeadGtId: value.familyHeadGtId,
      enqDate: value.created_at
        ? new Date(value.created_at).toLocaleDateString("en-GB")
        : null,
      tourName: value.tourName || "",
      startDate: value.startDate
        ? new Date(value.startDate).toLocaleDateString("en-GB")
        : null,
      endDate: value.endDate
        ? new Date(value.endDate).toLocaleDateString("en-GB")
        : null,
      guestName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
      contact: value.contact || "",
      tourPrice: value.tourPrice || 0,
      discount: value.additionalDis || 0,
      discounted: value.discountPrice || 0,
      gst: value.gst || 0,
      tcs: value.tcs || 0,
      grand: value.grandTotal || 0,
      advancePayment: value.advancePayment || 0,
      balance: value.balance || 0,
      groupPaymentDetailId: value.groupPaymentDetailId,
    }));

    return res.status(200).json({
      data: pendingListArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/paypending-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/paypending-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("❌ Error in payPendingList:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Confirmed Payments List (status = 1)
exports.pendingPayListCT = async (req, res) => {
  try {
    // ✅ Check token
    const tokenResult = await CommonController.checkToken(
      req.headers["token"],
      [44]
    );
    if (tokenResult.error) return res.status(401).json(tokenResult);

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let baseSql = `
      FROM grouptourpaymentdetails
      LEFT JOIN grouptourdiscountdetails 
        ON grouptourpaymentdetails.groupDisId = grouptourdiscountdetails.groupDisId
      LEFT JOIN enquirygrouptours 
        ON grouptourpaymentdetails.enquiryGroupId = enquirygrouptours.enquiryGroupId
      LEFT JOIN grouptourfamilyheaddetails 
        ON grouptourpaymentdetails.familyHeadGtId = grouptourfamilyheaddetails.familyHeadGtId
      LEFT JOIN grouptours 
        ON enquirygrouptours.groupTourId = grouptours.groupTourId
      WHERE grouptourpaymentdetails.status = 0
        AND enquirygrouptours.enquiryProcess = 2
    `;

    const params = [];

    // ✅ Date filters
    if (req.query.startDate && req.query.endDate) {
      baseSql += " AND grouptours.startDate >= ? AND grouptours.endDate <= ?";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      baseSql += " AND grouptours.startDate >= ?";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      baseSql += " AND grouptours.endDate <= ?";
      params.push(req.query.endDate);
    }

    // ✅ Tour name filter
    if (req.query.tourName) {
      baseSql += " AND grouptours.tourName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Guest name filter
    if (req.query.guestName) {
      baseSql +=
        " AND CONCAT(grouptourfamilyheaddetails.firstName, ' ', grouptourfamilyheaddetails.lastName) LIKE ?";
      params.push(`%${req.query.guestName}%`);
    }

    // ✅ Count query
    const countSql = `SELECT COUNT(*) as total ${baseSql}`;
    const [countRows] = await db.query(countSql, params);
    const total = countRows[0].total;

    // ✅ Data query
    const dataSql = `
      SELECT 
        grouptours.tourName,
        grouptours.startDate,
        grouptours.endDate,
        enquirygrouptours.enquiryGroupId,
        enquirygrouptours.enquiryId,
        enquirygrouptours.contact,
        enquirygrouptours.created_at,
        grouptourfamilyheaddetails.firstName,
        grouptourfamilyheaddetails.lastName,
        grouptourdiscountdetails.additionalDis,
        grouptourdiscountdetails.discountPrice,
        grouptourpaymentdetails.*
      ${baseSql}
      ORDER BY enquirygrouptours.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(dataSql, [...params, perPage, offset]);

    // ✅ Format results
    const pendingListArray = rows.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      uniqueEnqueryId: String(value.enquiryId || "").padStart(4, "0"),
      familyHeadGtId: value.familyHeadGtId,
      enqDate: value.created_at
        ? new Date(value.created_at).toLocaleDateString("en-GB")
        : null,
      tourName: value.tourName || "",
      startDate: value.startDate
        ? new Date(value.startDate).toLocaleDateString("en-GB")
        : null,
      endDate: value.endDate
        ? new Date(value.endDate).toLocaleDateString("en-GB")
        : null,
      guestName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
      contact: value.contact || "",
      tourPrice: value.tourPrice || 0,
      discount: value.additionalDis || 0,
      discounted: value.discountPrice || 0,
      gst: value.gst || 0,
      tcs: value.tcs || 0,
      grand: value.grandTotal || 0,
      advancePayment: value.advancePayment || 0,
      balance: value.balance || 0,
      groupPaymentDetailId: value.groupPaymentDetailId,
    }));

    return res.status(200).json({
      data: pendingListArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/paypending-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/paypending-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("❌ Error in payPendingList:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
// controllers/AccCTController.js
// ✅ Pending Payment List - Custom Tour
// exports.pendingPayListCT = async (req, res) => {
//   try {
//     // ✅ Check token
//     const tokenData = await CommonController.checkToken(req.headers.token, [
//       48,
//     ]);
//     if (tokenData.error) return res.status(401).json(tokenData);

//     // ✅ Pagination
//     const perPage = parseInt(req.query.perPage) || 10;
//     const page = parseInt(req.query.page) || 1;
//     const offset = (page - 1) * perPage;

//     // ✅ Base query with LEFT JOINs
//     let baseSql = `
//       FROM customtourpaymentdetails ctp
//       LEFT JOIN customtourdiscountdetails cdd ON ctp.customDisId = cdd.customDisId
//       LEFT JOIN enquirycustomtours ect ON ctp.enquiryCustomId = ect.enquiryCustomId
//       LEFT JOIN customtourenquirydetails ced ON ctp.enquiryDetailCustomId = ced.enquiryDetailCustomId
//       WHERE ctp.status = 0
//         AND ect.enquiryProcess = 2
//     `;

//     const params = [];

//     // ✅ Date filters
//     if (req.query.startDate && req.query.endDate) {
//       baseSql += " AND ect.startDate >= ? AND ect.endDate <= ?";
//       params.push(req.query.startDate, req.query.endDate);
//     } else if (req.query.startDate) {
//       baseSql += " AND ect.startDate >= ?";
//       params.push(req.query.startDate);
//     } else if (req.query.endDate) {
//       baseSql += " AND ect.endDate <= ?";
//       params.push(req.query.endDate);
//     }

//     // ✅ Tour name filter
//     if (req.query.tourName) {
//       baseSql += " AND ect.tourName LIKE ?";
//       params.push(`%${req.query.tourName}%`);
//     }

//     // ✅ Guest name filter
//     if (req.query.guestName) {
//       baseSql += " AND CONCAT(ced.firstName, ' ', ced.lastName) LIKE ?";
//       params.push(`%${req.query.guestName}%`);
//     }

//     // ✅ Count query
//     const countSql = `SELECT COUNT(*) as total ${baseSql}`;
//     const [countRows] = await db.query(countSql, params);
//     const total = countRows[0].total;

//     // ✅ Data query

//     const [rows] = await db.query(dataSql, [...params, perPage, offset]);

//     // ✅ Format results
//     const pendingListArray = rows.map((value) => ({
//       enquiryCustomId: value.enquiryCustomId,
//       uniqueEnqueryId: String(value.enquiryId || "").padStart(4, "0"),
//       enquiryDetailCustomId: value.enquiryDetailCustomId,
//       enqDate: value.created_at
//         ? new Date(value.created_at).toLocaleDateString("en-GB")
//         : null,
//       tourName: value.tourName || "",
//       startDate: value.startDate
//         ? new Date(value.startDate).toLocaleDateString("en-GB")
//         : null,
//       endDate: value.endDate
//         ? new Date(value.endDate).toLocaleDateString("en-GB")
//         : null,
//       guestName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
//       contact: value.contact || "",
//       tourPrice: value.tourPrice || 0,
//       discount: value.additionalDis || 0,
//       discounted: value.discountPrice || 0,
//       gst: value.gst || 0,
//       tcs: value.tcs || 0,
//       grandTotal: value.grandTotal || 0,
//       advancePayment: value.advancePayment || 0,
//       balance: value.grandTotal - (value.advancePayment || 0),
//       customPayDetailId: value.customPayDetailId,
//     }));

//     return res.status(200).json({
//       data: pendingListArray,
//       total,
//       currentPage: page,
//       perPage,
//       nextPageUrl:
//         page * perPage < total
//           ? `/pending-pay-list-ct?page=${page + 1}&perPage=${perPage}`
//           : null,
//       previousPageUrl:
//         page > 1
//           ? `/pending-pay-list-ct?page=${page - 1}&perPage=${perPage}`
//           : null,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("❌ Error in pendingPayListCT:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// ✅ Confirmed Payment List - Custom Tour
// ✅ Confirmed Payments List (status = 1)
// ✅ Confirmed Payments List (status = 1)

// ✅ confirmPayList in groupTourController.js
exports.confirmPayList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    const [rows] = await pool.query(
      `
      SELECT 
        COALESCE(egt.enquiryId, '-') AS enquiryId,
        COALESCE(DATE_FORMAT(egt.created_at, '%d-%m-%Y'), '-') AS enquiryDate,
        CONCAT(COALESCE(gfh.firstName, ''), ' ', COALESCE(gfh.lastName, '')) AS guestName,
        COALESCE(DATE_FORMAT(gt.startDate, '%d-%m-%Y'), '-') AS startDate,
        COALESCE(DATE_FORMAT(gt.endDate, '%d-%m-%Y'), '-') AS endDate,
        COALESCE(gdd.phoneNo, '-') AS phoneNo,
        COALESCE(gt.tourName, '-') AS tourName,
        COALESCE(gdd.tourPrice, 0) AS tourPrice,
        COALESCE(gdd.additionalDis, 0) AS additionalDis,
        COALESCE(gdd.discountPrice, 0) AS discountPrice,
        COALESCE(gdd.gst, 0) AS gst,
        COALESCE(gdd.tcs, 0) AS tcs,
        COALESCE(gdd.grandTotal, 0) AS grandTotal,
        COALESCE(gpd.advancePayment, 0) AS paid,
        COALESCE(gpd.balance, 0) AS balance,
        gpd.status
      FROM grouptourpaymentdetails gpd
      LEFT JOIN grouptourdiscountdetails gdd ON gpd.groupDisId = gdd.groupDisId
      LEFT JOIN enquirygrouptours egt ON gpd.enquiryGroupId = egt.enquiryGroupId
      LEFT JOIN grouptourfamilyheaddetails gfh ON gpd.familyHeadGtId = gfh.familyHeadGtId
      LEFT JOIN grouptours gt ON egt.groupTourId = gt.groupTourId
      WHERE gpd.status = 1
      ORDER BY egt.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [perPage, offset]
    );

    res.json({
      data: rows,
      currentPage: page,
      perPage,
      nextPageUrl: rows.length === perPage ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(rows.length / perPage),
    });
  } catch (error) {
    console.error("❌ confirmPayList error:", error);
    res.status(500).json({ error: error.message });
  }
};

//confirmed payment listing custom tour
// exports.confirmPayListCT = async (req, res) => {
//   try {
//     // 🔑 Token validation
//     const tokenData = await CommonController.checkToken(req.headers.token, [
//       48,
//     ]);
//     if (tokenData.error) return res.status(401).json(tokenData);
//     let { startDate, endDate, guestName, perPage = 10, page = 1 } = req.query;

//     perPage = parseInt(perPage);
//     page = parseInt(page);
//     const offset = (page - 1) * perPage;

//     // 🔎 Base query
//     let baseQuery = `
//       FROM customtourpaymentdetails ctp
//       JOIN customtourdiscountdetails cdd ON ctp.customDisId = cdd.customDisId
//       JOIN enquirycustomtours ect ON ctp.enquiryCustomId = ect.enquiryCustomId
//       JOIN customtourenquirydetails ced ON ctp.enquiryDetailCustomId = ced.enquiryDetailCustomId
//       WHERE ctp.status = 1
//     `;

//     let conditions = [];
//     let values = [];

//     // 🔎 Filters
//     if (startDate && endDate) {
//       conditions.push(`ect.startDate >= ? AND ect.endDate <= ?`);
//       values.push(
//         moment(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
//       );
//       values.push(moment(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss"));
//     } else if (startDate) {
//       conditions.push(`ect.startDate >= ?`);
//       values.push(
//         moment(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
//       );
//     } else if (endDate) {
//       conditions.push(`ect.endDate <= ?`);
//       values.push(moment(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss"));
//     }

//     if (guestName) {
//       conditions.push(`CONCAT(ced.firstName, ' ', ced.lastName) LIKE ?`);
//       values.push(`%${guestName}%`);
//     }

//     if (conditions.length > 0) {
//       baseQuery += " AND " + conditions.join(" AND ");
//     }

//     // ✅ Total count
//     const [countResult] = await db.query(
//       `SELECT COUNT(*) as total ${baseQuery}`,
//       values
//     );
//     const total = countResult.total;

//     // ✅ Paginated results
//     const [rows] = await db.query(
//       `
//       SELECT ect.*, ced.firstName, ced.lastName, cdd.*, ctp.*
//       ${baseQuery}
//       ORDER BY ect.created_at DESC
//       LIMIT ? OFFSET ?
//       `,
//       [...values, perPage, offset]
//     );

//     // ✅ Format response
//     let confirmCustomArray = rows.map((value) => {
//       return {
//         enquiryCustomId: value.enquiryCustomId,
//         uniqueEnqueryId: value.enquiryId
//           ? value.enquiryId.toString().padStart(4, "0")
//           : null,
//         groupName: value.groupName,
//         contactName: `${value.firstName} ${value.lastName}`,
//         contact: value.contact,
//         startDate: moment(value.startDate).format("DD-MM-YYYY"),
//         endDate: moment(value.endDate).format("DD-MM-YYYY"),
//         tourPrice: value.tourPrice,
//         additionalDis: value.additionalDis,
//         discountPrice: value.discountPrice,
//         gst: value.gst,
//         tcs: value.tcs,
//         grandTotal: value.grandTotal,
//         advancePayment: value.advancePayment,
//         balance: value.balance,
//         dueDate: value.payDate,
//         customPayDetailId: value.customPayDetailId,
//         enquiryDetailCustomId: value.enquiryDetailCustomId,
//       };
//     });

//     return res.status(200).json({
//       data: confirmCustomArray,
//       total,
//       currentPage: page,
//       perPage,
//       nextPageUrl:
//         page * perPage < total
//           ? `/confirm-pay-list-ct?page=${page + 1}&perPage=${perPage}`
//           : null,
//       previousPageUrl:
//         page > 1
//           ? `/confirm-pay-list-ct?page=${page - 1}&perPage=${perPage}`
//           : null,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("❌ confirmPayListCT error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };
exports.confirmPayListCT = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    const [rows] = await pool.query(
      `
      SELECT 
        COALESCE(egt.enquiryId, '-') AS enquiryId,
        COALESCE(DATE_FORMAT(egt.created_at, '%d-%m-%Y'), '-') AS enquiryDate,
        CONCAT(COALESCE(gfh.firstName, ''), ' ', COALESCE(gfh.lastName, '')) AS guestName,
        COALESCE(DATE_FORMAT(gt.startDate, '%d-%m-%Y'), '-') AS startDate,
        COALESCE(DATE_FORMAT(gt.endDate, '%d-%m-%Y'), '-') AS endDate,
        COALESCE(gdd.phoneNo, '-') AS phoneNo,
        COALESCE(gt.tourName, '-') AS tourName,
        COALESCE(gdd.tourPrice, 0) AS tourPrice,
        COALESCE(gdd.additionalDis, 0) AS additionalDis,
        COALESCE(gdd.discountPrice, 0) AS discountPrice,
        COALESCE(gdd.gst, 0) AS gst,
        COALESCE(gdd.tcs, 0) AS tcs,
        COALESCE(gdd.grandTotal, 0) AS grandTotal,
        COALESCE(gpd.advancePayment, 0) AS paid,
        COALESCE(gpd.balance, 0) AS balance,
        gpd.status
      FROM grouptourpaymentdetails gpd
      LEFT JOIN grouptourdiscountdetails gdd ON gpd.groupDisId = gdd.groupDisId
      LEFT JOIN enquirygrouptours egt ON gpd.enquiryGroupId = egt.enquiryGroupId
      LEFT JOIN grouptourfamilyheaddetails gfh ON gpd.familyHeadGtId = gfh.familyHeadGtId
      LEFT JOIN grouptours gt ON egt.groupTourId = gt.groupTourId
      WHERE gpd.status = 1
      ORDER BY egt.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [perPage, offset]
    );

    res.json({
      data: rows,
      currentPage: page,
      perPage,
      nextPageUrl: rows.length === perPage ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(rows.length / perPage),
    });
  } catch (error) {
    console.error("❌ confirmPayList error:", error);
    res.status(500).json({ error: error.message });
  }
};
// controllers/CustomTourController.js
//lost enquiries list
exports.lostEnquiryCustomTour = async (req, res) => {
  try {
    // ✅ Token validation
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [107]);
    if (tokenData.error) return res.status(401).json(tokenData);

    let { guestName, perPage, page } = req.query;

    perPage = perPage ? parseInt(perPage) : 10;
    page = page ? parseInt(page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query (removed createdBy filter)
    let baseQuery = `
      FROM enquirycustomtours ect
      JOIN dropdowndestination dd ON ect.destinationId = dd.destinationId
      WHERE ect.enquiryProcess = 3
    `;
    const queryParams = [];

    // ✅ Search by guest name
    if (guestName && guestName.trim() !== "") {
      baseQuery += ` AND CONCAT(ect.firstName, ' ', ect.lastName) LIKE ? `;
      queryParams.push(`%${guestName}%`);
    }

    // ✅ Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total ${baseQuery}`,
      queryParams
    );
    const total = countRows[0].total;

    // ✅ Paginated query
    const [rows] = await db.query(
      `
      SELECT ect.*, dd.destinationName
      ${baseQuery}
      ORDER BY ect.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...queryParams, perPage, offset]
    );

    // ✅ Format response
    const lostCustomArray = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
      enqDate: new Date(value.created_at).toLocaleDateString("en-GB"),
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollow: value.nextFollowUp,
      closureReason: value.closureReason,
    }));

    return res.status(200).json({
      data: lostCustomArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/lost-enquiry-custom?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/lost-enquiry-custom?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error in lostEnquiryCustomTour:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
exports.allLostEnqsGt = async (req, res) => {
  try {
    // ✅ Token validation
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [236]);
    if (tokenData.error) return res.status(401).json(tokenData);

    let { guestName, perPage, page } = req.query;

    perPage = perPage ? parseInt(perPage) : 10;
    page = page ? parseInt(page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let baseQuery = `
      FROM enquirygrouptours egt
      JOIN grouptours gt ON egt.groupTourId = gt.groupTourId
      WHERE egt.enquiryProcess = 3
    `;
    const queryParams = [];

    // ✅ Search filter
    if (guestName && guestName.trim() !== "") {
      baseQuery += ` AND CONCAT(egt.firstName, ' ', egt.lastName) LIKE ? `;
      queryParams.push(`%${guestName}%`);
    }

    // ✅ Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total ${baseQuery}`,
      queryParams
    );
    const total = countRows[0].total;

    // ✅ Paginated query
    const [rows] = await db.query(
      `
      SELECT egt.*, gt.tourName, gt.destinationId
      ${baseQuery}
      ORDER BY egt.enquiryGroupId DESC
      LIMIT ? OFFSET ?
      `,
      [...queryParams, perPage, offset]
    );

    // ✅ Format response
    const lostGroupArray = rows.map((value) => ({
      enqGroupId: value.enquiryGroupId,
      uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
      enqDate: new Date(value.created_at).toLocaleDateString("en-GB"),
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      tourName: value.tourName,
      destinationId: value.destinationId == 1 ? "Domestic" : "International",
      pax: (value.adults || 0) + (value.child || 0),
      lastFollow: value.nextFollowUp
        ? new Date(value.nextFollowUp).toLocaleDateString("en-GB")
        : null,
      closureReason: value.closureReason,
    }));

    return res.status(200).json({
      data: lostGroupArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-lost-enqs-gt?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-lost-enqs-gt?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error in allLostEnqsGt:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ all lost enquiries CT
exports.allLostEnqsCt = async (req, res) => {
  try {
    // check token
    const tokenData = await CommonController.checkToken(req.headers.token, [
      272,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    let { guestName, perPage, page } = req.query;
    perPage = perPage ? parseInt(perPage) : 10;
    page = page ? parseInt(page) : 1;
    const offset = (page - 1) * perPage;

    // base query
    let query = `
      SELECT e.enquiryCustomId, e.enquiryId, e.created_at, e.firstName, e.lastName, 
             e.contact, e.adults, e.child, e.nextFollowUp, e.closureReason,
             d.destinationName
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 3
    `;
    let values = [];

    // search filter
    if (guestName) {
      query += ` AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?`;
      values.push(`%${guestName}%`);
    }

    // count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as sub`,
      values
    );
    const total = countRows[0].total;

    // add pagination + order
    query += ` ORDER BY e.created_at DESC LIMIT ? OFFSET ?`;
    values.push(perPage, offset);

    const [rows] = await db.query(query, values);

    // map results
    const lostCustomArray = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: new Date(value.created_at).toLocaleDateString("en-GB"),
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      destinationName: value.destinationName,
      pax: value.adults + value.child,
      lastFollow: value.nextFollowUp,
      closureReason: value.closureReason,
    }));

    return res.status(200).json({
      data: lostCustomArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-lost-enqs-ct?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-lost-enqs-ct?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error in allLostEnqsCt:", err);
    return res
      .status(500)
      .json({ message: "Server Error", error: err.message });
  }
};

// controllers/SalesController.js
// guests list sales
exports.guestsList = async (req, res) => {
  try {
    // ✅ Token check
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      100,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let query = `
      SELECT users.userId, users.guestId, users.firstName, users.lastName, users.contact, 
             cardtype.cardName
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      WHERE 1=1
    `;
    const values = [];

    // 🔒 Add filter by creator (if you want same as Laravel)
    if (tokenData.userId) {
      query += " AND users.createdBy = ?";
      values.push(tokenData.userId);
    }

    // ✅ Searching
    if (req.query.guestName) {
      query += " AND CONCAT(users.firstName, ' ', users.lastName) LIKE ?";
      values.push(`%${req.query.guestName}%`);
    }
    if (req.query.tourCode) {
      query += " AND users.tourCode LIKE ?";
      values.push(`%${req.query.tourCode}%`);
    }
    if (req.query.cardName) {
      query += " AND cardtype.cardId LIKE ?";
      values.push(`%${req.query.cardName}%`);
    }

    // ✅ Add order & pagination
    query += " ORDER BY users.userId DESC LIMIT ? OFFSET ?";
    values.push(perPage, offset);

    // ✅ Execute query
    const [rows] = await db.query(query, values);

    // ✅ Count query (for pagination)
    let countQuery = `
      SELECT COUNT(*) as total
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      WHERE 1=1
    `;
    const countValues = [];

    if (tokenData.userId) {
      countQuery += " AND users.createdBy = ?";
      countValues.push(tokenData.userId);
    }
    if (req.query.guestName) {
      countQuery += " AND CONCAT(users.firstName, ' ', users.lastName) LIKE ?";
      countValues.push(`%${req.query.guestName}%`);
    }
    if (req.query.tourCode) {
      countQuery += " AND users.tourCode LIKE ?";
      countValues.push(`%${req.query.tourCode}%`);
    }
    if (req.query.cardName) {
      countQuery += " AND cardtype.cardId LIKE ?";
      countValues.push(`%${req.query.cardName}%`);
    }

    const [countRows] = await db.query(countQuery, countValues);
    const total = countRows[0].total;

    // ✅ Format response
    const guestsArray = rows.map((value) => ({
      userId: value.userId,
      guestId: value.guestId,
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      loyaltyCard: value.cardName,
    }));

    return res.status(200).json({
      data: guestsArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/guests-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1 ? `/guests-list?page=${page - 1}&perPage=${perPage}` : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ guestsList Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

// ✅ add-users with roleId 5
exports.addUsers = async (req, res) => {
  try {
    // check token
    const tokenData = await CommonController.checkToken(
      req.headers["token"],
      [141, 294]
    );
    if (!tokenData) {
      return res.status(408).json({ message: "Invalid token" });
    }

    const {
      firstName,
      lastName,
      phone,
      dob,
      cardId,
      email,
      preFixId,
      dom,
      adhar,
      adharNo,
      pan,
      panNo,
      passport,
      passportNo,
      loyaltyPoint,
      clientcode,
    } = req.body;

    // ✅ validation
    if (!firstName || !lastName || !phone || !dob || !cardId) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: "Phone must be 10 digits" });
    }

    // ✅ generate guestId (assuming CommonController has this function)
    const guestId = await CommonController.generateGuestId(firstName, lastName);
    const userName =
      req.body.userName ||
      `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${Date.now()}`;

    // ✅ insert query
    const [result] = await db.query(
      `INSERT INTO users 
  (preFixId,userName, firstName, lastName, contact, email, dob, marriageDate, adharCard, adharNo, pan, panNo, passport, passportNo, cardId, loyaltyPoints, guestId, createdBy, roleId,clientcode)
  VALUES (? ,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        preFixId || 1,
        userName,
        firstName,
        lastName,
        phone,
        email || null,
        dob,
        dom || null,
        adhar || null,
        adharNo || null,
        pan || null,
        panNo || null,
        passport || null,
        passportNo || null,
        cardId,
        loyaltyPoint === "" || loyaltyPoint == null ? 0 : loyaltyPoint,
        guestId,
        tokenData.userId,
        5, // roleId for guest
        clientcode || 1,
      ]
    );

    if (result.affectedRows > 0) {
      return res.status(200).json({ message: "User added successfully" });
    } else {
      return res.status(500).json({ message: "Something went wrong" });
    }
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}; //it is woring but you have to check it once again

exports.allGuestSearch = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      306,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination values
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query with join
    let query = `
      SELECT users.*, cardtype.cardName 
      FROM users 
      JOIN cardtype ON users.cardId = cardtype.cardId 
      WHERE 1=1
    `;
    const values = [];

    // ✅ Searching by contact
    if (req.query.contact) {
      query += " AND users.contact LIKE ?";
      values.push(`%${req.query.contact}%`);
    }

    // ✅ Order
    query += " ORDER BY users.userId DESC LIMIT ? OFFSET ?";
    values.push(perPage, offset);

    // ✅ Execute
    const [rows] = await db.query(query, values);

    // ✅ Get total count (without LIMIT)
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM users 
      JOIN cardtype ON users.cardId = cardtype.cardId 
      WHERE 1=1
    `;
    const countValues = [];
    if (req.query.contact) {
      countQuery += " AND users.contact LIKE ?";
      countValues.push(`%${req.query.contact}%`);
    }
    const [countRows] = await db.query(countQuery, countValues);
    const total = countRows[0].total;

    // ✅ Format response
    const guestsArray = rows.map((value) => ({
      userId: value.userId,
      guestId: value.guestId,
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      loyaltyCard: value.cardName,
    }));

    return res.status(200).json({
      data: guestsArray,
      total: total,
      currentPage: page,
      perPage: perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-guests-search?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-guests-search?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ allGuestSearch Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

//all-guests-list
exports.allGuestsList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      294,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination values
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let query = `
      SELECT users.*, cardtype.cardName 
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      WHERE 1=1
    `;
    const values = [];

    // ✅ Searching
    if (req.query.guestName) {
      query += " AND CONCAT(users.firstName, ' ', users.lastName) LIKE ?";
      values.push(`%${req.query.guestName}%`);
    }
    if (req.query.tourCode) {
      query += " AND users.tourCode LIKE ?";
      values.push(`%${req.query.tourCode}%`);
    }
    if (req.query.cardName) {
      query += " AND cardtype.cardId LIKE ?";
      values.push(`%${req.query.cardName}%`);
    }

    // ✅ Add order & pagination
    query += " ORDER BY users.userId DESC LIMIT ? OFFSET ?";
    values.push(perPage, offset);

    // ✅ Execute query
    const [rows] = await db.query(query, values);

    // ✅ Count query (for pagination)
    let countQuery = `
      SELECT COUNT(*) as total
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      WHERE 1=1
    `;
    const countValues = [];
    if (req.query.guestName) {
      countQuery += " AND CONCAT(users.firstName, ' ', users.lastName) LIKE ?";
      countValues.push(`%${req.query.guestName}%`);
    }
    if (req.query.tourCode) {
      countQuery += " AND users.tourCode LIKE ?";
      countValues.push(`%${req.query.tourCode}%`);
    }
    if (req.query.cardName) {
      countQuery += " AND cardtype.cardId LIKE ?";
      countValues.push(`%${req.query.cardName}%`);
    }

    const [countRows] = await db.query(countQuery, countValues);
    const total = countRows[0].total;

    // ✅ Format response
    const guestsArray = rows.map((value) => ({
      userId: value.userId,
      guestId: value.guestId,
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      loyaltyCard: value.cardName,
      printedStatus: value.printedStatus,
      printedStatusName: value.printedStatus == 1 ? "Printed" : "Not Printed",
      deliveryStatus: value.deliveryStatus,
      deliveryStatusName:
        value.deliveryStatus == 1 ? "Delivered" : "Not Delivered",
    }));

    return res.status(200).json({
      data: guestsArray,
      total: total,
      currentPage: page,
      perPage: perPage,
      nextPageUrl:
        page * perPage < total
          ? `/all-guests-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-guests-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("❌ allGuestsList Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

exports.usersDetails = async (req, res) => {
  try {
    const { userId } = req.query; // since it's GET request
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // ✅ Get user data
    const [userRows] = await db.query(
      `SELECT 
        users.userId, users.contact, users.dob, users.address, users.email, users.preFixId,
        users.firstName, users.lastName, users.marriageDate, users.adharNo, users.panNo,
        users.cardId, users.passport, cardtype.cardName, users.passportNo,
        users.adharCard, users.pan, users.loyaltyPoints
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      WHERE users.userId = ? LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRows[0];

    // ✅ Date calculations
    const oneYearAgoDate = moment()
      .subtract(1, "years")
      .format("YYYY-MM-DD HH:mm:ss");
    const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");

    // ✅ Credited Points
    const [creditRows] = await db.query(
      `SELECT COALESCE(SUM(loyaltyPoint),0) as creditedPoints
       FROM loyaltypoints
       WHERE isType = 0 AND userId = ? AND created_at >= ?`,
      [user.userId, oneYearAgoDate]
    );
    const creditedPoints = creditRows[0].creditedPoints || 0;

    // ✅ Debited Points
    const [debitRows] = await db.query(
      `SELECT COALESCE(SUM(loyaltyPoint),0) as debitedPoints
       FROM loyaltypoints
       WHERE isType = 1 AND userId = ? AND created_at >= ?`,
      [user.userId, oneYearAgoDate]
    );
    const debitedPoints = debitRows[0].debitedPoints || 0;

    // ✅ Final Loyalty Points
    const loyaltyPoint = creditedPoints - debitedPoints;

    // ✅ Response object
    return res.status(200).json({
      preFixId: user.preFixId,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.contact,
      dob: user.dob,
      dom: user.marriageDate || "",
      email: user.email || "",
      adharNo: user.adharNo,
      panNo: user.panNo || "",
      passportNo: user.passportNo || "",
      adhar: user.adharCard,
      pan: user.pan || "",
      passport: user.passport || "",
      loyaltyCard: user.cardName,
      loyaltyPoint: loyaltyPoint,
      cardId: user.cardId,
    });
  } catch (err) {
    console.error("❌ usersDetails Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

exports.updateUserData = async (req, res) => {
  try {
    // ✅ Check token
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [112, 294]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Validation (Joi)
    const schema = Joi.object({
      userId: Joi.number().required(),
      firstName: Joi.string().required(),
      lastName: Joi.string().required(),
      phone: Joi.string().length(10).required(),
      dob: Joi.string().required(),
      preFixId: Joi.any().optional(),
      email: Joi.string().allow(null, ""),
      dom: Joi.string().allow(null, ""),
      adhar: Joi.string().allow(null, ""),
      adharNo: Joi.alternatives()
        .try(Joi.string(), Joi.number())
        .allow(null, ""),
      pan: Joi.string().allow(null, ""),
      panNo: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, ""),
      passport: Joi.string().allow(null, ""),
      passportNo: Joi.alternatives()
        .try(Joi.string(), Joi.number())
        .allow(null, ""),
      cardId: Joi.number().allow(null, ""),
      loyaltyPoint: Joi.number().allow(null, ""),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((e) => e.message) });
    }

    const {
      userId,
      firstName,
      preFixId,
      lastName,
      phone,
      email,
      dob,
      dom,
      adhar,
      adharNo,
      pan,
      panNo,
      passport,
      passportNo,
      cardId,
      loyaltyPoint,
    } = value;

    // ✅ Check if user exists
    const [userRows] = await db.query("SELECT * FROM users WHERE userId = ?", [
      userId,
    ]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: "User Not Found" });
    }
    const user = userRows[0];

    // ✅ Get enquiryId (from group/custom tour guest details)
    const [gtDataRows] = await db.query(
      "SELECT * FROM grouptourguestdetails WHERE guestId = ? ORDER BY created_at DESC LIMIT 1",
      [user.guestId]
    );
    const [ctDataRows] = await db.query(
      "SELECT * FROM customtourguestdetails WHERE guestId = ? ORDER BY created_at DESC LIMIT 1",
      [user.guestId]
    );

    const gtData = gtDataRows[0];
    const ctData = ctDataRows[0];
    const enquiryId = gtData
      ? gtData.enquiryGroupId
      : ctData
      ? ctData.enquiryCustomId
      : 0;

    // ✅ Update user
    await db.query(
      `UPDATE users SET
        firstName = ?, preFixId = ?, lastName = ?, contact = ?, email = ?, dob = ?,
        marriageDate = ?, adharCard = ?, adharNo = ?, pan = ?, panNo = ?, passport = ?,
        passportNo = ?, cardId = ?, guestId = ?
      WHERE userId = ?`,
      [
        firstName,
        preFixId,
        lastName,
        phone,
        email,
        dob,
        dom,
        adhar,
        adharNo,
        pan,
        panNo,
        passport,
        passportNo,
        cardId,
        user.guestId,
        userId,
      ]
    );

    // ✅ (Optional) Insert loyalty points
    /*
    if (loyaltyPoint) {
      const descType = gtData ? 1 : ctData ? 3 : 0;
      const isGroupCustom = gtData ? 1 : ctData ? 2 : 0;

      await db.query(
        `INSERT INTO loyaltypoints
          (loyaltyPoint, description, userId, isGroupCustom, descType, enquiryId)
         VALUES (?, 'self', ?, ?, ?, ?)`,
        [loyaltyPoint, userId, isGroupCustom, descType, enquiryId]
      );
    }
    */

    return res.status(200).json({ message: "User Data Updated Successfully" });
  } catch (err) {
    console.error("❌ updateUserData Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

exports.guestsDetails = async (req, res) => {
  try {
    console.log("🚀 guestsDetails API hit at:", new Date());
    console.log("👉 req.query:", req.query);

    // ✅ Input validation
    const schema = Joi.object({
      guestId: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
      tab: Joi.number().valid(1, 2).required(),
      perPage: Joi.number().default(10),
      page: Joi.number().default(1),
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((e) => e.message) });
    }

    const { guestId, tab, perPage, page } = value;

    // ✅ Fetch guest info
    const [guestRows] = await db.query(
      `SELECT u.userId, u.contact, u.address, u.firstName, u.lastName, 
              u.adharNo, u.panNo, u.passportNo, u.adharCard, u.pan, ct.cardName
       FROM users u
       JOIN cardtype ct ON u.cardId = ct.cardId
       WHERE u.guestId = ?`,
      [guestId]
    );

    if (guestRows.length === 0) {
      return res.status(404).json({ message: "Guest not found" });
    }
    const guest = guestRows[0];

    // ✅ Calculate loyalty points (last 1 year)
    const oneYearAgo = dayjs()
      .subtract(1, "year")
      .format("YYYY-MM-DD HH:mm:ss");

    const [[{ credited = 0 }]] = await db.query(
      `SELECT IFNULL(SUM(loyaltyPoint),0) as credited
       FROM loyaltypoints 
       WHERE isType = 0 AND userId = ? AND created_at >= ?`,
      [guest.userId, oneYearAgo]
    );

    const [[{ debited = 0 }]] = await db.query(
      `SELECT IFNULL(SUM(loyaltyPoint),0) as debited
       FROM loyaltypoints 
       WHERE isType = 1 AND userId = ? AND created_at >= ?`,
      [guest.userId, oneYearAgo]
    );

    const loyaltyPoint = credited - debited;

    // ✅ Pagination
    const offset = (page - 1) * perPage;
    let dataRows = [];

    if (tab === 1) {
      // Group Tours
      const [rows] = await db.query(
        `SELECT g.tourName, g.startDate, g.endDate, c.countryName, s.stateName, egt.adults
         FROM enquirygrouptours egt
         JOIN grouptours g ON egt.groupTourId = g.groupTourId
         LEFT JOIN states s ON g.stateId = s.stateId
         LEFT JOIN countries c ON g.countryId = c.countryId
         WHERE egt.enquiryProcess = 2 AND egt.guestId = ?
         LIMIT ? OFFSET ?`,
        [guestId, perPage, offset]
      );
      dataRows = rows;
    } else {
      // Custom Tours
      const [rows] = await db.query(
        `SELECT ect.groupName, ect.startDate, ect.endDate, c.countryName, s.stateName, ect.adults
         FROM enquirycustomtours ect
         LEFT JOIN countries c ON ect.countryId = c.countryId
         LEFT JOIN states s ON ect.stateId = s.stateId
         WHERE ect.enquiryProcess = 2 AND ect.guestId = ?
         LIMIT ? OFFSET ?`,
        [guestId, perPage, offset]
      );
      dataRows = rows;
    }

    const dataArray = dataRows.map((row) => ({
      tourName: tab === 1 ? row.tourName : row.groupName,
      startDate: row.startDate,
      endDate: row.endDate,
      countryName: row.countryName,
      stateName: row.stateName,
      adults: row.adults,
    }));

    return res.status(200).json({
      _debug: "API_UPDATED_v2",
      phoneNo: guest.contact,
      address: guest.address,
      billingName: `${guest.firstName} ${guest.lastName}`,
      adharNo: guest.adharNo,
      panNo: guest.panNo || "",
      passportNo: guest.passportNo || "",
      adharCard: guest.adharCard,
      pan: guest.pan || "",
      loyaltyCard: guest.cardName,
      loyaltyPoint,
      data: dataArray,
      total: dataArray.length,
      currentPage: page,
      perPage,
    });
  } catch (err) {
    console.error("❌ guestsDetails error:", err);
    return res
      .status(500)
      .json({ message: err.message, _debug: "API_UPDATED_v2" });
  }
};
exports.refereeNoOfGuests = async (req, res) => {
  try {
    console.log("🚀 refereeNoOfGuests API hit at:", new Date());

    const [refereeGuests] = await db.query(
      `
      SELECT 
        e.guestRefId,
        COUNT(*) AS enquiryCount,
        u.firstName,
        u.lastName
      FROM enquirygrouptours e
      LEFT JOIN users u ON e.guestRefId = u.guestId
      WHERE e.guestRefId IS NOT NULL
        AND e.enquiryProcess = 2
      GROUP BY e.guestRefId, u.firstName, u.lastName
      ORDER BY enquiryCount DESC
      LIMIT 5
      `
    );

    console.log("✅ Referee Guests fetched:", refereeGuests.length);

    return res.status(200).json({
      _debug: "API_UPDATED_v2",
      refereeGuests,
    });
  } catch (error) {
    console.error("❌ refereeNoOfGuests error:", error);
    return res.status(500).json({ message: error.message });
  }
};

exports.allGuestsSalesReceived = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      295,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Get total loyalty points per user
    const [topGuests] = await db.query(`
      SELECT 
        u.userId, u.firstName, u.lastName,
        IFNULL(SUM(lp.loyaltyPoint), 0) AS totalLoyaltyPoints
      FROM users u
      LEFT JOIN loyaltypoints lp ON u.userId = lp.userId
      GROUP BY u.userId, u.firstName, u.lastName
      ORDER BY totalLoyaltyPoints DESC
      LIMIT 5
    `);

    return res.status(200).json({ topGuests });
  } catch (err) {
    console.error("Error in allGuestsSalesReceived:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.loyaltyGuests = async (req, res) => {
  try {
    // ✅ Token check
    const token = req.header("token");
    const tokenData = await CommonController.checkToken(token, [103]);

    if (!tokenData) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    // ✅ Pagination defaults
    const perPage = req.query.perPageItem
      ? parseInt(req.query.perPageItem)
      : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query filters
    let whereClauses = [`u.roleId = 0`];
    let queryParams = [];

    if (req.query.name) {
      whereClauses.push(`CONCAT(u.firstName, ' ', u.lastName) LIKE ?`);
      queryParams.push(`%${req.query.name}%`);
    }
    if (req.query.cardName) {
      whereClauses.push(`c.cardName LIKE ?`);
      queryParams.push(`%${req.query.cardName}%`);
    }
    if (req.query.refferalId) {
      whereClauses.push(`u.guestId LIKE ?`);
      queryParams.push(`%${req.query.refferalId}%`);
    }

    const whereSQL = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // ✅ Total count query
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total
       FROM users u
       INNER JOIN cardtype c ON u.cardId = c.cardId
       ${whereSQL}`,
      queryParams
    );
    const total = countResult[0].total;

    // ✅ Main query with netPoints calculation
    const [users] = await db.query(
      `
      SELECT u.userId, u.firstName, u.lastName, u.guestId AS referralId, 
             c.cardName,
             COALESCE(SUM(CASE WHEN l.isType = 0 THEN l.loyaltyPoint ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN l.isType = 1 THEN l.loyaltyPoint ELSE 0 END),0) AS loyaltyPoints,
             u.printedStatus, u.deliveryStatus, u.created_at
      FROM users u
      INNER JOIN cardtype c ON u.cardId = c.cardId
      LEFT JOIN loyaltypoints l 
        ON u.userId = l.userId 
        AND l.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
      ${whereSQL}
      GROUP BY u.userId, u.firstName, u.lastName, u.guestId, c.cardName, u.printedStatus, u.deliveryStatus, u.created_at
      ORDER BY loyaltyPoints DESC
      LIMIT ? OFFSET ?
      `,
      [...queryParams, perPage, offset]
    );

    const users_array = users.map((user) => ({
      userId: user.userId,
      userName: `${user.firstName} ${user.lastName}`,
      cardName: user.cardName,
      referralId: user.referralId,
      loyaltyPoints: parseFloat(user.loyaltyPoints),
      printedStatus: user.printedStatus,
      printedStatusName: user.printedStatus === 1 ? "Printed" : "Not Printed",
      deliveryStatus: user.deliveryStatus,
      deliveryStatusName:
        user.deliveryStatus === 1 ? "Delivered" : "Not Delivered",
      date: dayjs(user.created_at).format("YYYY-MM-DD"),
    }));

    const lastPage = Math.ceil(total / perPage);
    const nextPageUrl =
      page < lastPage
        ? `/loyalty-guests?page=${page + 1}&perPageItem=${perPage}`
        : null;
    const previousPageUrl =
      page > 1
        ? `/loyalty-guests?page=${page - 1}&perPageItem=${perPage}`
        : null;

    return res.status(200).json({
      data: users_array,
      total,
      currentPage: page,
      perPage,
      nextPageUrl,
      previousPageUrl,
      lastPage,
    });
  } catch (error) {
    console.error("Error in loyaltyGuests:", error);
    return res.status(500).json({ message: error.message });
  }
};

exports.allRefereeNoOfGuests = async (req, res) => {
  try {
    // ✅ Token check
    const token = req.header("token");
    const tokenData = await CommonController.checkToken(token, [295]);

    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Query: top 5 referee guests
    const [refereeGuests] = await db.query(
      `
  SELECT 
    enquirygrouptours.guestRefId,
    COUNT(*) as enquiryCount,
    users.firstName,
    users.lastName
  FROM enquirygrouptours
  LEFT JOIN users ON enquirygrouptours.guestRefId = users.guestId
  WHERE enquirygrouptours.guestRefId IS NOT NULL
    AND enquirygrouptours.enquiryProcess = 2
  GROUP BY enquirygrouptours.guestRefId, users.firstName, users.lastName
  ORDER BY enquiryCount DESC
  LIMIT 5
  `
    );

    return res.status(200).json({
      refereeGuests,
    });
  } catch (error) {
    console.error("Error in allRefereeNoOfGuests:", error);
    return res.status(500).json({ message: error.message });
  }
};

exports.allGuestsSalesReceived = async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      295,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // Calculate total loyalty points per user (credited - debited)
    const [rows] = await db.query(`
      SELECT 
        u.firstName, 
        u.lastName, 
        u.guestId,
        IFNULL(SUM(CASE WHEN lp.isType = 0 THEN lp.loyaltyPoint ELSE 0 END),0) -
        IFNULL(SUM(CASE WHEN lp.isType = 1 THEN lp.loyaltyPoint ELSE 0 END),0) AS totalLoyaltyPoints
      FROM users u
      LEFT JOIN loyaltypoints lp ON u.userId = lp.userId
      GROUP BY u.userId
      ORDER BY totalLoyaltyPoints DESC
      LIMIT 5
    `);

    return res.status(200).json({ refereeGuestsSales: rows });
  } catch (err) {
    console.error("Error in allGuestsSalesReceived:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.allLoyaltyGuests = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      295,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination setup
    const perPage = req.query.perPageItem
      ? parseInt(req.query.perPageItem)
      : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base query
    let whereClause = "WHERE users.roleId = 0";
    let params = [];

    // ✅ Search filters
    if (req.query.name) {
      whereClause += " AND CONCAT(users.firstName, ' ', users.lastName) LIKE ?";
      params.push(`%${req.query.name}%`);
    }
    if (req.query.cardName) {
      whereClause += " AND cardtype.cardId LIKE ?";
      params.push(`%${req.query.cardName}%`);
    }
    if (req.query.refferalId) {
      whereClause += " AND users.guestId LIKE ?";
      params.push(`%${req.query.refferalId}%`);
    }

    // ✅ Count total
    const [countRows] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      ${whereClause}
      `,
      params
    );
    const total = countRows[0].total;

    // ✅ Get paginated users
    const [users] = await db.query(
      `
      SELECT users.userId, users.firstName, users.lastName, users.loyaltyPoints,
             cardtype.cardName, users.guestId, users.created_at,
             users.printedStatus, users.deliveryStatus
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      ${whereClause}
      ORDER BY users.userId DESC
      LIMIT ? OFFSET ?
      `,
      [...params, perPage, offset]
    );

    // ✅ Calculate loyalty points for last 1 year
    const oneYearAgo = dayjs()
      .subtract(1, "year")
      .format("YYYY-MM-DD HH:mm:ss");

    const users_array = [];
    for (let user of users) {
      const [creditedRow] = await db.query(
        `
        SELECT IFNULL(SUM(loyaltyPoint), 0) as credited
        FROM loyaltypoints
        WHERE isType = 0 AND userId = ? AND created_at >= ?
        `,
        [user.userId, oneYearAgo]
      );

      const [debitedRow] = await db.query(
        `
        SELECT IFNULL(SUM(loyaltyPoint), 0) as debited
        FROM loyaltypoints
        WHERE isType = 1 AND userId = ? AND created_at >= ?
        `,
        [user.userId, oneYearAgo]
      );

      const loyaltyPoint = creditedRow[0].credited - debitedRow[0].debited;

      users_array.push({
        userId: user.userId,
        userName: `${user.firstName} ${user.lastName}`,
        cardName: user.cardName,
        referralId: user.guestId,
        loyaltyPoints: loyaltyPoint,
        printedStatus: user.printedStatus,
        printedStatusName: user.printedStatus === 1 ? "Printed" : "Not Printed",
        deliveryStatus: user.deliveryStatus,
        deliveryStatusName:
          user.deliveryStatus === 1 ? "Delivered" : "Not Delivered",
        date: dayjs(user.created_at).format("YYYY-MM-DD"),
      });
    }

    // ✅ Build pagination response
    const lastPage = Math.ceil(total / perPage);

    return res.status(200).json({
      data: users_array,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page < lastPage
          ? `/all-loyalty-guests?page=${page + 1}&perPageItem=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/all-loyalty-guests?page=${page - 1}&perPageItem=${perPage}`
          : null,
      lastPage,
    });
  } catch (err) {
    console.error("Error in allLoyaltyGuests:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /get-edit-tour-type
exports.getEditTourType = async (req, res) => {
  try {
    const { tourTypeId } = req.query; // ✅ since it's GET, use query params

    // ✅ Validation
    if (!tourTypeId || isNaN(Number(tourTypeId))) {
      return res
        .status(400)
        .json({ message: "tourTypeId is required and must be numeric" });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [1]);
    if (!tokenData) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    // ✅ Fetch tour type
    const [rows] = await db.query(
      "SELECT * FROM tourtype WHERE tourTypeId = ?",
      [tourTypeId]
    );

    if (rows.length > 0) {
      return res.status(200).json({ data: rows[0] });
    } else {
      return res.status(404).json({ message: "Tour type not found" });
    }
  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /get-edit-tour-type
exports.getEditTourType = async (req, res) => {
  try {
    const { tourTypeId } = req.query; // ✅ since it's GET, use query params

    // ✅ Validation
    if (!tourTypeId || isNaN(Number(tourTypeId))) {
      return res
        .status(400)
        .json({ message: "tourTypeId is required and must be numeric" });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [1]);
    if (!tokenData) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    // ✅ Fetch tour type
    const [rows] = await db.query(
      "SELECT * FROM tourtype WHERE tourTypeId = ?",
      [tourTypeId]
    );

    if (rows.length > 0) {
      return res.status(200).json({ data: rows[0] });
    } else {
      return res.status(404).json({ message: "Tour type not found" });
    }
  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//////////////////////////////////review crud /////////////////////////////////////////

// exports.addReview = async (req, res) => {
//   try {
//     const { tourCode, imageUrl, title, rating, content, type, customerName } =
//       req.body;

//     // ✅ Validation
//     if (!tourCode || !title || !rating || !content || !type || !customerName) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // ✅ Check token
//     const tokenData = await CommonController.checkToken(req.headers["token"], [
//       339,
//     ]);
//     if (tokenData.error) return res.status(401).json(tokenData);

//     // ✅ Get tour data based on type
//     const query =
//       type == 1
//         ? "SELECT * FROM grouptours WHERE tourCode = ?"
//         : "SELECT * FROM tailormades WHERE tourCode = ?";

//     const tourResults = await new Promise((resolve, reject) => {
//       db.query(query, [tourCode], (err, results) => {
//         if (err) reject(err);
//         else resolve(results);
//       });
//     });

//     if (!tourResults.length) {
//       return res.status(404).json({ message: "tour code not matched" });
//     }

//     const tourData = tourResults[0];
//     const tourDate = moment(tourData.startDate).format("MMMM YYYY");

//     // ✅ Insert review
//     const insertQuery = `
//       INSERT INTO reviews
//       (tourCode, tourName, tourDate, imageUrl, title, rating, content, customerName, type)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     await new Promise((resolve, reject) => {
//       db.query(
//         insertQuery,
//         [
//           tourCode,
//           tourData.tourName,
//           tourDate,
//           imageUrl || null, // optional image
//           title,
//           rating,
//           content,
//           customerName,
//           type,
//         ],
//         (err, result) => {
//           if (err) reject(err);
//           else resolve(result);
//         }
//       );
//     });

//     return res.status(200).json({ message: "Review Added Successfully" });
//   } catch (error) {
//     console.error("Error in addReview:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

exports.addReview = async (req, res) => {
  const { tourCode, imageUrl, title, rating, content, type, customerName } =
    req.body;

  try {
    // ✅ Validation
    if (!tourCode || !title || !rating || !content || !type || !customerName) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      339,
    ]);
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    // ✅ Get tour data
    const [tourResults] =
      type == 1
        ? await db.query("SELECT * FROM grouptours WHERE tourCode = ?", [
            tourCode,
          ])
        : await db.query("SELECT * FROM tailormades WHERE tourCode = ?", [
            tourCode,
          ]);

    if (tourResults.length === 0) {
      return res.status(404).json({ message: "tour code not matched" });
    }

    const tourData = tourResults[0];
    const tourDate = moment(tourData.startDate).format("MMMM YYYY");

    // ✅ Insert review
    await db.query(
      `
  INSERT INTO reviews
  (tourCode, tourDate, imageUrl, title, rating, content, customerName, type, clientcode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      [
        tourCode,
        tourDate,
        imageUrl || "",
        title,
        rating,
        content,
        customerName,
        type,
        clientcode,
      ]
    );

    return res.status(200).json({ message: "Review Added Successfully" });
  } catch (error) {
    console.error("❌ Error in addReview:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /get-edit-review
exports.getEditReview = async (req, res) => {
  try {
    const { reviewId } = req.query; // ✅ use query params for GET request

    // ✅ Validation
    if (!reviewId || isNaN(Number(reviewId))) {
      return res
        .status(400)
        .json({ message: "reviewId is required and must be numeric" });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [343]);

    // In Laravel, it returned a JsonResponse if invalid. Let's mimic that:
    if (!tokenData || tokenData.error) {
      return res.status(401).json({ message: "Invalid Token" });
    }

    // ✅ Fetch review
    const [rows] = await db.query("SELECT * FROM reviews WHERE reviewId = ?", [
      reviewId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "review not found" });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /edit-review
exports.editReview = async (req, res) => {
  try {
    console.log("👉 Incoming body:", req.body);

    const {
      reviewId,
      type,
      tourCode,
      imageUrl,
      title,
      rating,
      content,
      customerName,
    } = req.body;
    console.log("reviewId :", reviewId);

    // ✅ Validation
    if (!reviewId || isNaN(Number(reviewId))) {
      return res
        .status(400)
        .json({ message: "reviewId is required and must be numeric" });
    }

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [343]);
    if (!tokenData || tokenData.error) {
      return res.status(401).json({ message: "Invalid Token" });
    }

    // ✅ Find tour data
    let toursQuery =
      type == 1
        ? "SELECT * FROM grouptours WHERE tourCode = ?"
        : "SELECT * FROM tailormades WHERE tourCode = ?";

    const [toursRows] = await db.query(toursQuery, [tourCode]);

    if (toursRows.length === 0) {
      return res.status(404).json({ message: "tour code not matched" });
    }

    const toursData = toursRows[0];
    const tourDate = moment(toursData.startDate).format("MMMM YYYY"); // Carbon::parse()->format('F Y')

    // ✅ Check review exists
    const [reviewRows] = await db.query(
      "SELECT * FROM reviews WHERE reviewId = ?",
      [reviewId]
    );
    if (reviewRows.length === 0) {
      return res.status(404).json({ message: "review not found" });
    }

    // ✅ Update review
    await db.query(
      `UPDATE reviews 
       SET tourCode = ?, tourName = ?, tourDate = ?, imageUrl = ?, 
           title = ?, rating = ?, content = ?, customerName = ?, type = ? 
       WHERE reviewId = ?`,
      [
        tourCode,
        toursData.tourName,
        tourDate,
        imageUrl,
        title,
        rating,
        content,
        customerName,
        type,
        reviewId,
      ]
    );

    return res.status(200).json({ message: "review updated successfully" });
  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////

// exports.salesTeamLeadListing = async (req, res) => {
//   try {
//     // ✅ Check token
//     const tokenData = await CommonController.checkToken(req.headers['token'], [275]);
//     if (tokenData.error) {
//       return res.status(401).json({ message: tokenData.message });
//     }

//     const perPage = parseInt(req.query.perPage) || 10;
//     const page = parseInt(req.query.page) || 1;
//     const offset = (page - 1) * perPage;

//     // ✅ Fetch team leads with join
//     const salesTeamResults = await new Promise((resolve, reject) => {
//       const query = `
//         SELECT teamlead.*, users.userName
//         FROM teamlead
//         JOIN users ON teamlead.leadId = users.userId
//         LIMIT ?, ?
//       `;
//       db.query(query, [offset, perPage], (err, results) => {
//         if (err) reject(err);
//         else resolve(results);
//       });
//     });

//     // ✅ Fetch total count for pagination
//     const totalResults = await new Promise((resolve, reject) => {
//       const query = `SELECT COUNT(*) as total FROM teamlead`;
//       db.query(query, (err, results) => {
//         if (err) reject(err);
//         else resolve(results[0].total);
//       });
//     });

//     const salesTeamArray = [];

//     for (const value of salesTeamResults) {
//       const myObj = {
//         id: value.id,
//         teamName: value.teamName,
//         leadId: value.userName,
//         assignAgent: []
//       };

//       const assignUserArray = JSON.parse(value.assignAgent || '[]');

//       for (const userId of assignUserArray) {
//         const user = await new Promise((resolve, reject) => {
//           db.query(`SELECT userName FROM users WHERE userId = ?`, [userId], (err, results) => {
//             if (err) reject(err);
//             else resolve(results[0] || null);
//           });
//         });

//         if (user) myObj.assignAgent.push(user.userName);
//       }

//       salesTeamArray.push(myObj);
//     }

//     const totalPages = Math.ceil(totalResults / perPage);
//     const nextPageUrl = page < totalPages ? `/sales-team-lead-listing?page=${page + 1}&perPage=${perPage}` : null;
//     const previousPageUrl = page > 1 ? `/sales-team-lead-listing?page=${page - 1}&perPage=${perPage}` : null;

//     return res.status(200).json({
//       data: salesTeamArray,
//       total: totalResults,
//       currentPage: page,
//       perPage,
//       nextPageUrl,
//       previousPageUrl,
//       lastPage: totalPages
//     });
//   } catch (error) {
//     console.error("Error in salesTeamLeadListing:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

exports.salesTeamLeadListing = async (req, res) => {
  let connection;
  try {
    console.log("➡️ Request received for /sales-team-lead-listing");

    // ✅ Get connection from pool
    connection = await db.getConnection();
    console.log("✅ DB connection acquired");

    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      275,
    ]);
    // if (!tokenData || tokenData.status !== 200) {
    //   console.log("❌ Invalid token:", tokenData?.message);
    //   return res.status(401).json({ message: tokenData?.message || "Unauthorized" });
    // }
    if (!tokenData || tokenData.error) {
      return res.status(401).json({ message: "Invalid Token" });
    }

    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Fetch team leads with join
    const [salesTeamResults] = await connection.query(
      `
      SELECT teamlead.*, users.userName
      FROM teamlead
      JOIN users ON teamlead.leadId = users.userId
      LIMIT ?, ?
      `,
      [offset, perPage]
    );

    // ✅ Fetch total count
    const [totalResults] = await connection.query(
      `SELECT COUNT(*) as total FROM teamlead`
    );
    const total = totalResults[0].total;

    const salesTeamArray = [];

    for (const value of salesTeamResults) {
      const resolvedTeamName =
        value.teamName ||
        value.teamLeadName ||
        value.team_lead_name ||
        value.team_title ||
        value.name ||
        "";
      const myObj = {
        id: value.id,
        teamName: resolvedTeamName,
        leadId: value.userName,
        userName: value.userName,
        assignAgent: [],
      };

      const assignUserArray = JSON.parse(value.assignAgent || "[]");

      for (const userId of assignUserArray) {
        const [userRows] = await connection.query(
          `SELECT userName FROM users WHERE userId = ?`,
          [userId]
        );
        if (userRows.length > 0) {
          myObj.assignAgent.push(userRows[0].userName);
        }
      }

      salesTeamArray.push(myObj);
    }

    const totalPages = Math.ceil(total / perPage);
    const basePath = `${req.baseUrl || ""}${req.path || ""}` || "";
    const nextPageUrl =
      page < totalPages
        ? `${basePath}?page=${page + 1}&perPage=${perPage}`
        : null;
    const previousPageUrl =
      page > 1
        ? `${basePath}?page=${page - 1}&perPage=${perPage}`
        : null;

    return res.status(200).json({
      data: salesTeamArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl,
      previousPageUrl,
      lastPage: totalPages,
    });
  } catch (error) {
    console.error("❌ Error in salesTeamLeadListing:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (connection) {
      connection.release(); // ✅ Always release connection
      console.log("🔓 DB connection released");
    }
  }
};

/////////////////////////
//RoleManagementController ///////////////////////////////////////////
// Controller without express-validator
// exports.futureTourEnquiryDetails = async (req, res) => {
//   try {
//     console.log("➡️ Request received for /future-tour-enquiry-details");

//     // ✅ Token check
//     console.log("🔑 Checking token...");
//     const tokenData = await CommonController.checkToken(req.headers["token"], [
//       134,
//     ]);
//     console.log("token Data :", tokenData);
//     if (tokenData.error) {
//       console.log("❌ Token invalid:", tokenData.message);
//       return res.status(401).json({ message: tokenData.message });
//     }

//     const { name, city, phoneNo, address, email, startDate, endDate } =
//       req.body;

//     // ✅ Validation like Laravel
//     if (!name || typeof name !== "string" || name.length > 255) {
//       return res
//         .status(400)
//         .json({ message: "Name is required and must be max 255 characters" });
//     }
//     if (!city) return res.status(400).json({ message: "City is required" });
//     if (!phoneNo || !/^\d{10}$/.test(phoneNo)) {
//       return res
//         .status(400)
//         .json({ message: "Phone number is required and must be 10 digits" });
//     }
//     if (!address)
//       return res.status(400).json({ message: "Address is required" });
//     if (!email || !/^\S+@\S+\.\S+$/.test(email))
//       return res.status(400).json({ message: "Valid email is required" });
//     if (!startDate)
//       return res.status(400).json({ message: "Start date is required" });
//     if (!endDate)
//       return res.status(400).json({ message: "End date is required" });

//     // ✅ Insert into DB
//     console.log("📥 Inserting enquiry into DB...");
//     await db.query(
//       `INSERT INTO futuretourenquirydetails
//        (name, city, phoneNo, address, email, startDate, endDate, createdBy)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         name,
//         JSON.stringify(city),
//         phoneNo,
//         address,
//         email,
//         startDate,
//         endDate,
//         tokenData.data.userId,
//       ]
//     );

//     console.log("✅ Enquiry added successfully");
//     return res.status(200).json({ message: "Enquiry added successfully" });
//   } catch (err) {
//     console.error("❌ Error in futureTourEnquiryDetails:", err);
//     return res.status(500).json({ message: err.message });
//   }
// };

exports.futureTourEnquiryDetails = async (req, res) => {
  try {
    console.log("➡️ Request received for /future-tour-enquiry-details");

    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [134]);

    if (tokenData.status !== 200) {
      return res.status(401).json({ message: tokenData.message });
    }

    const user = tokenData.data;

    // Validation
    const { name, city, phoneNo, address, email, startDate, endDate } =
      req.body;
    if (
      !name ||
      !city ||
      !phoneNo ||
      !address ||
      !email ||
      !startDate ||
      !endDate
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    console.log("📥 Inserting enquiry into DB...");

    const query = `
      INSERT INTO futuretourenquirydetails 
      (name, city, phoneNo, address, email, startDate, endDate, createdBy, clientcode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [
      name,
      JSON.stringify(city), // storing city as JSON array/string
      phoneNo,
      address,
      email,
      startDate,
      endDate,
      user.userId, // createdBy
      user.clientcode, // clientcode (important!)
    ]);

    return res.status(200).json({ message: "Enquiry added successfully" });
  } catch (error) {
    console.error("❌ Error in futureTourEnquiryDetails:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Assuming you have `express` and `mysql2/promise` set up
// db = MySQL pool/connection, CommonController.checkToken is available

exports.addGTSupplierPaymentsDetails = async (req, res) => {
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

    if (!Array.isArray(paymentDetails))
      return res
        .status(400)
        .json({ message: ["paymentDetails must be an array"] });

    if (paymentDetails.some((p) => isNaN(p) || p < 0))
      return res
        .status(400)
        .json({ message: ["paymentDetails must contain numbers >= 0"] });

    if (balance === undefined || isNaN(balance) || balance < 0)
      return res
        .status(400)
        .json({ message: ["balance must be a number >= 0"] });

    if (!groupTourId)
      return res.status(400).json({ message: ["groupTourId is required"] });

    // ✅ Token check
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [367]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Check group tour exists
    const [groupTourRows] = await db.query(
      "SELECT * FROM grouptours WHERE groupTourId = ?",
      [groupTourId]
    );
    if (groupTourRows.length === 0)
      return res.status(404).json({ message: "Group Tour Not Found" });

    // ✅ Calculate balance
    const calculatedBalance = total - paymentDetails.reduce((a, b) => a + b, 0);
    if (calculatedBalance !== Number(balance))
      return res
        .status(400)
        .json({ message: "Payment Details and Balance are not matching" });

    // ✅ Insert into supplierpayments
    const [insertResult] = await db.query(
      `INSERT INTO supplierpayments 
      (supplierName, type, total, paymentDetails, balance, createdBy, groupTourId)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        supplierName,
        type,
        total,
        JSON.stringify(paymentDetails),
        balance,
        tokenData.userId,
        groupTourId,
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
};
exports.changeStatusPrint = async (req, res) => {
  try {
    // ✅ Validate request body
    const schema = Joi.object({
      userId: Joi.number().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((e) => e.message) });
    }

    const { userId } = value;

    // ✅ Check token
    const token = req.header("token");
    const tokenData = await CommonController.checkToken(token, [294]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Update printedStatus
    const [result] = await db.query(
      `UPDATE users SET printedStatus = 1 WHERE userId = ?`,
      [userId]
    );

    if (result.affectedRows > 0) {
      return res
        .status(200)
        .json({ message: "Print Status updated successfully" });
    } else {
      return res.status(404).json({ message: "Guest user not found" });
    }
  } catch (err) {
    console.error("Error in changeStatusPrint:", err);
    return res.status(500).json({ message: err.message });
  }
};
exports.downloadWaariSelectReport = async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    if (!year) {
      return res.status(400).json({ message: "Year is required" });
    }
    const nextYear = year + 1;
    const startDate = `${year}-04-01 00:00:00`;
    const endDate = `${nextYear}-03-31 23:59:59`;

    // Fetch all users
    const [usersList] = await db.query(
      `SELECT u.userId, u.firstName, u.lastName, u.loyaltyPoints, c.cardName, u.guestId
       FROM users u
       JOIN cardtype c ON u.cardId = c.cardId
       ORDER BY u.userId DESC`
    );

    const users_array = [];

    for (const user of usersList) {
      // Self bookings
      const [groupBooking] = await db.query(
        `SELECT * FROM enquirygrouptours
         WHERE enquiryProcess = 2 AND guestId = ? AND created_at BETWEEN ? AND ?`,
        [user.guestId, startDate, endDate]
      );

      const [customBooking] = await db.query(
        `SELECT * FROM customtourenquirydetails
         WHERE status = 1 AND guestId = ? AND created_at BETWEEN ? AND ?`,
        [user.guestId, startDate, endDate]
      );

      const [points] = await db.query(
        `SELECT * FROM loyaltypoints WHERE userId = ? AND created_at BETWEEN ? AND ?`,
        [user.userId, startDate, endDate]
      );

      const [referral] = await db.query(
        `SELECT * FROM users WHERE referral = ? AND created_at BETWEEN ? AND ?`,
        [user.userId, startDate, endDate]
      );

      // Referral bookings
      const referralGuestIds = referral.map((r) => r.guestId);
      const [referralGroupBooking] =
        referralGuestIds.length > 0
          ? await db.query(
              `SELECT * FROM enquirygrouptours
               WHERE enquiryProcess = 2 AND guestId IN (?) AND created_at BETWEEN ? AND ?`,
              [referralGuestIds, startDate, endDate]
            )
          : [[]];

      const [referralCustomBooking] =
        referralGuestIds.length > 0
          ? await db.query(
              `SELECT * FROM customtourenquirydetails
               WHERE status = 1 AND guestId IN (?) AND created_at BETWEEN ? AND ?`,
              [referralGuestIds, startDate, endDate]
            )
          : [[]];

      // Tour sale calculations
      const selfTourSaleGroup =
        groupBooking.length > 0
          ? await db.query(
              `SELECT SUM(discountPrice) as total FROM grouptourdiscountdetails
               WHERE enquiryGroupId IN (?) AND created_at BETWEEN ? AND ?`,
              [groupBooking.map((b) => b.enquiryGroupId), startDate, endDate]
            )
          : [[{ total: 0 }]];

      const selfTourSaleCustom =
        customBooking.length > 0
          ? await db.query(
              `SELECT SUM(discountPrice) as total FROM customtourdiscountdetails
               WHERE enquiryCustomId IN (?) AND created_at BETWEEN ? AND ?`,
              [customBooking.map((b) => b.enquiryCustomId), startDate, endDate]
            )
          : [[{ total: 0 }]];

      const referralTourSaleGroup =
        referralGroupBooking.length > 0
          ? await db.query(
              `SELECT SUM(discountPrice) as total FROM grouptourdiscountdetails
               WHERE enquiryGroupId IN (?) AND created_at BETWEEN ? AND ?`,
              [
                referralGroupBooking.map((b) => b.enquiryGroupId),
                startDate,
                endDate,
              ]
            )
          : [[{ total: 0 }]];

      const referralTourSaleCustom =
        referralCustomBooking.length > 0
          ? await db.query(
              `SELECT SUM(discountPrice) as total FROM customtourdiscountdetails
               WHERE enquiryCustomId IN (?) AND created_at BETWEEN ? AND ?`,
              [
                referralCustomBooking.map((b) => b.enquiryCustomId),
                startDate,
                endDate,
              ]
            )
          : [[{ total: 0 }]];

      const selfTourSale =
        (selfTourSaleGroup[0][0]?.total || 0) +
        (selfTourSaleCustom[0][0]?.total || 0);

      const referredGuestSale =
        (referralTourSaleGroup[0][0]?.total || 0) +
        (referralTourSaleCustom[0][0]?.total || 0);

      const totalPointsEarned = points
        .filter((p) => p.isType === 0)
        .reduce((acc, p) => acc + p.loyaltyPoint, 0);

      const pointsEarnedThroughReferral = points
        .filter((p) => p.isType === 0 && p.description === "referral")
        .reduce((acc, p) => acc + p.loyaltyPoint, 0);

      const selfBookingPoints = points
        .filter((p) => p.isType === 0 && p.description === "self")
        .reduce((acc, p) => acc + p.loyaltyPoint, 0);

      const pointsRedeem = points
        .filter((p) => p.isType === 1)
        .reduce((acc, p) => acc + p.loyaltyPoint, 0);

      users_array.push({
        userId: user.userId,
        userName: `${user.firstName} ${user.lastName}`,
        cardName: user.cardName,
        referralId: user.guestId,
        loyaltyPoints: user.loyaltyPoints,
        selfBooking: groupBooking.length + customBooking.length,
        selfTourSale,
        totalPointsEarned,
        pointsEarnedThroughReferral,
        selfBookingPoints,
        referredGuest: referral.length,
        referredGuestSale,
        pointsRedeem,
      });
    }

    return res.status(200).json(users_array);
  } catch (err) {
    console.error("Error in downloadWaariSelectReport:", err);
    return res.status(500).json({ message: err.message });
  }
};

exports.addInfluencerAffiliate = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      195,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Validation
    const {
      firstName,
      lastName,
      role,
      email,
      phoneNo,
      address,
      password,
      couponName,
      fromDate,
      toDate,
      discountType,
      discountValue,
      maxDiscount,
      isType,
      commissionType,
      commissionValue,
      maxCommission,
      accName,
      accNo,
      bankName,
      branch,
      ifsc,
      fbLink,
      instagramLink,
      twitterLink,
      otherLink,
      cheque,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !role ||
      !email ||
      !phoneNo ||
      !address ||
      !password ||
      !couponName
    ) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const roleNum = Number(role);
    if (![1, 2].includes(roleNum)) {
      return res.status(400).json({ message: "Role must be 1 or 2" });
    }

    // ✅ Get a connection for transaction
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // ✅ Insert coupon
      const [couponResult] = await connection.query(
        `INSERT INTO coupons 
        (couponName, fromDate, toDate, status, discountType, discountValue, maxDiscount, isType, couponType, clientcode) 
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, 2, 'C001')`,
        [
          couponName,
          fromDate,
          toDate,
          discountType,
          discountValue,
          maxDiscount,
          isType,
        ]
      );

      const couponId = couponResult.insertId;

      // ✅ Insert influencer/affiliate
      await connection.query(
        `INSERT INTO influencersaffiliates 
        (couponId, firstName, lastName, password, role, email, phoneNo, fbLink, instagramLink, twitterLink, otherLink, address, commissionType, commissionValue, maxCommission, accName, accNo, bankName, branch, cheque, ifsc, token, clientcode) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          couponId,
          firstName,
          lastName,
          await bcrypt.hash(password, 10),
          roleNum,
          email,
          phoneNo,
          fbLink || null,
          instagramLink || null,
          twitterLink || null,
          otherLink || null,
          address,
          commissionType || 1,
          commissionValue || 0,
          maxCommission || 0,
          accName || null,
          accNo || null,
          bankName || null,
          branch || null,
          cheque || null,
          ifsc || null,
          Math.floor(100000 + Math.random() * 900000) + Date.now(),
          "C001", // default clientcode
        ]
      );

      await connection.commit();
      connection.release();
      return res.status(200).json({ message: "Account added successfully" });
    } catch (err) {
      await connection.rollback();
      connection.release();
      console.error("Transaction error:", err);
      return res.status(400).json({ message: err.message });
    }
  } catch (err) {
    console.error("Error in addInfluencerAffiliate:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
exports.deleteInfluencerAffiliate = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      198,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Validate input
    const { id } = req.query;
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ message: "Valid 'id' is required" });
    }

    // ✅ Check if influencer exists
    const [rows] = await db.query(
      "SELECT * FROM influencersaffiliates WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Account not found" });
    }

    // ✅ Delete influencer
    await db.query("DELETE FROM influencersaffiliates WHERE id = ?", [id]);

    return res.status(200).json({ message: "Account Deleted Successfully" });
  } catch (err) {
    console.error("Error in deleteInfluencerAffiliate:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// controllers/userController.js

// MySQL pool

// Token check function (example)
async function checkToken(token, allowedRoles) {
  // Implement your token verification logic here
  // Return user info if valid, else null
  return token ? { userId: 1, role: allowedRoles[0] } : null;
}

// Add User API
exports.addUser = async (req, res) => {
  let connection;
  try {
    // ✅ Optional token check
    const token = req.headers["token"];
    if (!token) return res.status(401).json({ message: "Invalid Token" });

    // ✅ Extract fields from request body
    const {
      firstName,
      lastName,
      userName,
      email,
      password,
      contact,
      address,
      status,
      gender,
      roleId,
      positionId,
      departmentId,
      sectorId,
      establishmentName,
      establishmentTypeId,
      adharCard,
      adharNo,
      pan,
      panNo,
      city,
      state,
      pincode,
      alternatePhone,
      shopAct,
      accName,
      accNo,
      bankName,
      branch,
      ifsc,
      cheque,
      logo,
    } = req.body;

    // ✅ Required fields check
    if (!firstName || !lastName || !userName || !email || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // ✅ Get DB connection
    connection = await db.getConnection();
    await connection.beginTransaction();

    // ✅ Insert into users table
    const [userResult] = await connection.query(
      `INSERT INTO users
        (firstName, lastName, userName, email, password, contact, address, status, gender, roleId, establishmentName, establishmentTypeId, adharCard, adharNo, pan, panNo, token, clientcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName,
        lastName,
        userName,
        email,
        await bcrypt.hash(password, 10),
        contact || null,
        address || null,
        status != null ? status : 1,
        gender || null,
        roleId || null,
        establishmentName || null,
        establishmentTypeId || null,
        adharCard || null,
        adharNo || null,
        pan || null,
        panNo || null,
        Math.floor(100000 + Math.random() * 900000) + Date.now(),
        "C001", // default clientcode
      ]
    );

    const userId = userResult.insertId;

    // ✅ Insert into userdetails table
    await connection.query(
      `INSERT INTO userdetails
        (userId, departmentId, positionId, sectorId, city, state, pincode, alternatePhone, shopAct, accName, accNo, bankName, branch, ifsc, cheque, logo, clientcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        departmentId || null,
        positionId || null,
        sectorId || null,
        city || null,
        state || null,
        pincode || null,
        alternatePhone || null,
        shopAct || null,
        accName || null,
        accNo || null,
        bankName || null,
        branch || null,
        ifsc || null,
        cheque || null,
        logo || null,
        "C001", // default clientcode
      ]
    );

    await connection.commit();
    connection.release();

    return res.status(200).json({ message: "User added successfully" });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error("Error in addUser:", err);
    return res.status(400).json({ message: err.message });
  }
};

// GET: /api/view-users-data?userId=1
// controllers/userController.js

// controller
// exports.viewUsersData = async (req, res) => {
//   try {
//     // 🔹 Get token from headers
//     const token = req.headers["token"];
//     if (!token) return res.status(401).json({ message: "Token is required" });

//     // 🔹 Validate token (check role access)
//     const tokenData = await CommonController.checkToken(token, [367]); // adjust roleIds
//     if (tokenData.error) return res.status(401).json(tokenData);

//     // 🔹 Get userId from route params
//     const userId = req.params.userId;
//     if (!userId || isNaN(Number(userId))) {
//       return res
//         .status(400)
//         .json({ message: "userId is required and must be numeric" });
//     }

//     // 🔹 Fetch user base info
//     const [usersData] = await db.query(
//       `SELECT u.*, r.roleName
//        FROM users u
//        JOIN roles r ON u.roleId = r.roleId
//        WHERE u.userId = ?`,
//       [userId]
//     );

//     if (!usersData || usersData.length === 0) {
//       return res.status(404).json({ message: "User does not exist" });
//     }
//     const user = usersData[0];

//     // 🔹 Fetch user details from view
//     const [userInfoData] = await db.query(
//       `SELECT ud.*, s.sectorName, dp.positionName, dd.departmentName
//        FROM user_details_view ud
//        LEFT JOIN sectors s ON ud.sectorId = s.sectorId
//        LEFT JOIN dropdownpositions dp ON ud.positionId = dp.positionId
//        LEFT JOIN dropdowndepartment dd ON ud.departmentId = dd.departmentId
//        WHERE ud.userId = ?`,
//       [userId]
//     );

//     const userInfo = userInfoData && userInfoData[0] ? userInfoData[0] : {};

//     // 🔹 Build final response
//     const myObj = {
//       userId: user.userId,
//       userName: user.userName,
//       email: user.email,
//       contact: user.contact,
//       status: user.status,
//       gender: user.gender,
//       roleId: user.roleId,
//       roleName: user.roleName,
//       address: user.address,
//       adharCard: user.adharCard,
//       adharNo: user.adharNo,
//       pan: user.pan,
//       panNo: user.panNo,
//       establishmentName: user.establishmentName,
//       establishmentTypeId: user.establishmentTypeId,
//       city: userInfo.city || "",
//       pincode: userInfo.pincode || "",
//       state: userInfo.state || "",
//       alternatePhone: userInfo.alternatePhone || "",
//       shopAct: userInfo.shopAct || "",
//       accName: userInfo.accName || "",
//       accNo: userInfo.accNo || "",
//       bankName: userInfo.bankName || "",
//       branch: userInfo.branch || "",
//       ifsc: userInfo.ifsc || "",
//       cheque: userInfo.cheque || "",
//       logo: userInfo.logo || "",
//       positionId: userInfo.positionId || "",
//       positionName: userInfo.positionName || "",
//       departmentId: userInfo.departmentId || "",
//       departmentName: userInfo.departmentName || "",
//       sectorId: userInfo.sectorId || "",
//       sectorName: userInfo.sectorName || "",
//     };

//     return res.status(200).json({ data: myObj });
//   } catch (err) {
//     console.error("Error in viewUsersData:", err);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };
