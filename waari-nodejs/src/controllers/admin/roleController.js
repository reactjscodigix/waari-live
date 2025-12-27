const db = require("../../../db"); // MySQL connection
const CommonController = require("../CommonController"); // for checkToken
const moment = require("moment");
const Joi = require("joi");
const pool = require("../../../db"); // adjust path as needed
//const { checkToken } = require('../../utils/common');
const { query, validationResult } = require("express-validator");
const dayjs = require("dayjs");

// list roles (matches PHP style)
exports.listsRole = async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      128,
    ]);
    if (!tokenData || tokenData.error) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    const perPage = parseInt(req.query.perPage, 10) || 10;
    const page = parseInt(req.query.page, 10) || 1;
    const offset = (page - 1) * perPage;

    const [totalResult] = await db.execute(`SELECT COUNT(*) as total FROM users`);
    const total = totalResult[0]?.total || 0;

    const [users] = await db.execute(
      `SELECT u.userId, u.userName, u.email, u.contact, u.status, u.roleId, r.roleName
       FROM users u
       LEFT JOIN roles r ON u.roleId = r.roleId
       ORDER BY u.created_at DESC
       LIMIT ${perPage} OFFSET ${offset}`
    );

    const usersArray = users.map((value) => ({
      userId: value.userId,
      userName: value.userName || "",
      roleId: value.roleId,
      roleName: value.roleName || "",
      contact: value.contact || "",
      email: value.email || "",
      status: value.status ?? 0,
    }));

    return res.status(200).json({
      data: usersArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        offset + perPage < total
          ? `/lists-user?perPage=${perPage}&page=${page + 1}`
          : null,
      previousPageUrl:
        page > 1 ? `/lists-user?perPage=${perPage}&page=${page - 1}` : null,
      lastPage: Math.ceil(total / perPage) || 1,
    });
  } catch (error) {
    console.error("Error fetching users list:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// Get dropdown department
exports.dropdownDepartment = async (req, res) => {
  try {
    const [departmentList] = await db.execute(
      `SELECT * FROM dropdowndepartment`
    );

    const departmentArray = departmentList.map((dept) => ({
      departmentId: dept.departmentId,
      departmentName: dept.departmentName,
    }));

    return res.status(200).json({ data: departmentArray });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.dropdownPositions = async (req, res) => {
  try {
    const [users] = await db.execute(`SELECT * FROM dropdownpositions`);

    const users_array = users.map((u) => ({
      positionId: u.positionId,
      positionName: u.positionName,
    }));

    return res.status(200).json({ data: users_array });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Get dropdown roles
exports.dropdownRoles = async (req, res) => {
  try {
    const [roles] = await db.execute(`
            SELECT roleId, roleName 
            FROM roles 
            WHERE roleId != 1 AND isActive = 1
        `);

    const roles_array = roles.map((r) => ({
      roleId: r.roleId,
      roleName: r.roleName,
    }));

    return res.status(200).json({ data: roles_array });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// View user data
// View user data
exports.viewUsersData = async (req, res) => {
  const { id } = req.params; // get id from route params

  if (!id || isNaN(id)) {
    return res
      .status(400)
      .json({ message: ["userId is required and must be numeric"] });
  }

  try {
    // Get basic user info with role
    const [users] = await db.execute(
      `
            SELECT u.*, r.roleName
            FROM users u
            JOIN roles r ON u.roleId = r.roleId
            WHERE u.userId = ?
        `,
      [id]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User does not exist" });
    }

    const user = users[0];

    // Get detailed user info (from view)
    const [userInfos] = await db.execute(
      `
            SELECT ud.*, s.sectorName, p.positionName, d.departmentName
            FROM user_details_view ud
            LEFT JOIN sectors s ON ud.sectorId = s.sectorId
            JOIN dropdownpositions p ON ud.positionId = p.positionId
            JOIN dropdowndepartment d ON ud.departmentId = d.departmentId
            WHERE ud.userId = ?
        `,
      [id]
    );

    const userInfo = userInfos[0] || {};

    const myObj = {
      userName: user.userName,
      email: user.email,
      contact: user.contact,
      status: user.status,
      gender: user.gender,
      roleId: user.roleId,
      roleName: user.roleName,
      address: user.address,
      adharCard: user.adharCard,
      adharNo: user.adharNo,
      pan: user.pan,
      panNo: user.panNo,
      establishmentName: user.establishmentName,
      establishmentTypeId: user.establishmentTypeId,
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
    return res.status(500).json({ message: err.message });
  }
};
// enquiry follow up list customize tour
exports.enquiryFollowCustomTourList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (!tokenData) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    const {
      startDate,
      endDate,
      tourName,
      search,
      perPage = 10,
      page = 1,
    } = req.query;

    const offset = (page - 1) * perPage;

    // ✅ Base query
    let query = `
      SELECT e.*, d.destinationName
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 1
      AND DATE(e.nextFollowUp) = CURDATE()
      AND TIME(e.nextFollowUpTime) > CURTIME()
      AND e.createdBy = ?
    `;

    let params = [tokenData.userId];

    // ✅ Filters
    if (startDate && endDate) {
      query += ` AND e.startDate >= ? AND e.endDate <= ? `;
      params.push(
        moment(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
      params.push(moment(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss"));
    } else if (startDate) {
      query += ` AND e.startDate >= ? `;
      params.push(
        moment(startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    } else if (endDate) {
      query += ` AND e.endDate <= ? `;
      params.push(moment(endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss"));
    }

    if (tourName) {
      query += ` AND e.groupName LIKE ? `;
      params.push(`%${tourName}%`);
    }

    if (search) {
      query += ` AND CONCAT(e.firstName, ' ', e.lastName) LIKE ? `;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY e.nextFollowUpTime ASC LIMIT ? OFFSET ?`;
    params.push(Number(perPage), Number(offset));

    // ✅ Fetch paginated data
    const [rows] = await db.execute(query, params);

    // ✅ Total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM enquirycustomtours e
      WHERE e.enquiryProcess = 1
      AND DATE(e.nextFollowUp) = CURDATE()
      AND TIME(e.nextFollowUpTime) > CURTIME()
      AND e.createdBy = ?
    `;
    let countParams = [tokenData.userId];

    const [countResult] = await db.execute(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    // ✅ Prepare response
    const enquiryCustomArray = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: tokenData.userName,
    }));

    return res.status(200).json({
      data: enquiryCustomArray,
      total: total,
      currentPage: Number(page),
      perPage: Number(perPage),
      nextPageUrl:
        offset + Number(perPage) < total
          ? `/enquiry-follow-custom-tour-list?perPage=${perPage}&page=${
              Number(page) + 1
            }`
          : null,
      previousPageUrl:
        Number(page) > 1
          ? `/enquiry-follow-custom-tour-list?perPage=${perPage}&page=${
              Number(page) - 1
            }`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

exports.expiredenquiryFollowCT = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);

    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const userId = tokenData.userId;
    const today = moment().format("YYYY-MM-DD");
    const currentTime = moment().format("HH:mm:ss");

    // ✅ Pagination
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base SQL
    let sql = `
      SELECT enquirycustomtours.*, dropdowndestination.destinationName 
      FROM enquirycustomtours
      JOIN dropdowndestination 
        ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      WHERE enquirycustomtours.enquiryProcess = 1
        AND enquirycustomtours.createdBy = ?
        AND (
          DATE(enquirycustomtours.nextFollowUp) < ?
          OR (DATE(enquirycustomtours.nextFollowUp) = ? 
              AND TIME(enquirycustomtours.nextFollowUpTime) < ?)
        )
    `;
    let values = [userId, today, today, currentTime];

    // ✅ Filters
    if (req.query.startDate && req.query.endDate) {
      const startDate = moment(req.query.startDate)
        .startOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      const endDate = moment(req.query.endDate)
        .endOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      sql += ` AND enquirycustomtours.startDate >= ? AND enquirycustomtours.endDate <= ? `;
      values.push(startDate, endDate);
    }
    if (req.query.startDate) {
      const startDate = moment(req.query.startDate)
        .startOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      sql += ` AND enquirycustomtours.startDate >= ? `;
      values.push(startDate);
    }
    if (req.query.endDate) {
      const endDate = moment(req.query.endDate)
        .endOf("day")
        .format("YYYY-MM-DD HH:mm:ss");
      sql += ` AND enquirycustomtours.endDate <= ? `;
      values.push(endDate);
    }
    if (req.query.tourName) {
      sql += ` AND enquirycustomtours.groupName LIKE ? `;
      values.push(`%${req.query.tourName}%`);
    }
    if (req.query.search) {
      sql += ` AND CONCAT(enquirycustomtours.firstName, ' ', enquirycustomtours.lastName) LIKE ? `;
      values.push(`%${req.query.search}%`);
    }

    // ✅ Ordering & Pagination
    sql += ` ORDER BY enquirycustomtours.nextFollowUp DESC, enquirycustomtours.nextFollowUpTime DESC `;
    sql += ` LIMIT ? OFFSET ? `;
    values.push(perPage, offset);

    // ✅ Query data
    const [rows] = await db.query(sql, values);

    // ✅ Count total
    let countSql = `
      SELECT COUNT(*) as total
      FROM enquirycustomtours
      WHERE enquiryProcess = 1 
        AND createdBy = ?
        AND (
          DATE(nextFollowUp) < ?
          OR (DATE(nextFollowUp) = ? AND TIME(nextFollowUpTime) < ?)
        )
    `;
    let countValues = [userId, today, today, currentTime];
    const [countResult] = await db.query(countSql, countValues);
    const total = countResult[0].total;

    // ✅ Format response
    const enquiryCustomArray = rows.map((value) => {
      return {
        enquiryCustomId: value.enquiryCustomId,
        uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
        enqDate: moment(value.created_at).format("DD-MM-YYYY"),
        groupName: value.groupName,
        contactName: `${value.firstName} ${value.lastName}`,
        startDate: moment(value.startDate).format("DD-MM-YYYY"),
        endDate: moment(value.endDate).format("DD-MM-YYYY"),
        contact: value.contact,
        destinationName: value.destinationName,
        pax: (value.adults || 0) + (value.child || 0),
        lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
        nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
        nextFollowUpTime: value.nextFollowUpTime,
        userName: tokenData.userName,
      };
    });

    return res.status(200).json({
      data: enquiryCustomArray,
      total: total,
      currentPage: page,
      perPage: perPage,
      nextPageUrl: total > page * perPage ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching expired enquiry follow-ups:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
exports.upcomingenquiryFollowCT = async (req, res) => {
  try {
    // ✅ check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const today = moment().format("YYYY-MM-DD");
    let params = [today, tokenData.userId];
    let sql = `
      SELECT e.*, d.destinationName 
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 1 
        AND e.nextFollowUp > ? 
        AND e.createdBy = ?
    `;

    // 🔍 filters
    if (req.query.startDate && req.query.endDate) {
      sql += " AND e.startDate >= ? AND e.endDate <= ? ";
      params.push(req.query.startDate, req.query.endDate);
    }
    if (req.query.startDate) {
      sql += " AND e.startDate >= ? ";
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += " AND e.endDate <= ? ";
      params.push(req.query.endDate);
    }
    if (req.query.groupName) {
      sql += " AND e.groupName LIKE ? ";
      params.push(`%${req.query.groupName}%`);
    }
    if (req.query.guestName) {
      sql +=
        " AND CONCAT(COALESCE(e.firstName,''), ' ', COALESCE(e.lastName,'')) LIKE ? ";
      params.push(`%${req.query.guestName}%`);
    }

    sql += " ORDER BY e.nextFollowUp ASC, e.nextFollowUpTime ASC ";

    // pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    const [rows] = await db.query(sql + " LIMIT ? OFFSET ?", [
      ...params,
      perPage,
      offset,
    ]);

    // count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total 
       FROM enquirycustomtours e 
       WHERE e.enquiryProcess = 1 
         AND e.nextFollowUp > ? 
         AND e.createdBy = ?`,
      [today, tokenData.userId]
    );

    let data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: value.adults + value.child,
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      remark: value.remark,
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: tokenData.userName,
    }));

    res.json({
      data,
      total: countRows[0].total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(countRows[0].total / perPage),
    });
  } catch (error) {
    console.error("Error fetching upcoming enquiries:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.dropdownSector = async (req, res) => {
  try {
    // query sectors table
    const [rows] = await db.query("SELECT sectorId, sectorName FROM sectors");

    // if empty
    if (!rows.length) {
      return res.json({ data: [] });
    }

    // map into array of objects
    const sectorArray = rows.map((value) => ({
      sectorId: value.sectorId,
      sectorName: value.sectorName,
    }));

    res.status(200).json({ data: sectorArray });
  } catch (error) {
    console.error("Error fetching sector list:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.ddHotelCat = async (req, res) => {
  try {
    // ✅ pagination (default: page 1, 10 items per page)
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // fetch hotel categories with pagination
    const [rows] = await db.query(
      "SELECT hotelCatId, hotelCatName FROM dropdownhotelcategory LIMIT ? OFFSET ?",
      [perPage, offset]
    );

    // count total for pagination info
    const [countRows] = await db.query(
      "SELECT COUNT(*) as total FROM dropdownhotelcategory"
    );

    // if empty
    if (!rows.length) {
      return res.json({ data: [], total: 0, currentPage: page, perPage });
    }

    // map results
    const hotlCatList_array = rows.map((value) => ({
      hotelCatId: value.hotelCatId,
      hotelCatName: value.hotelCatName,
    }));

    // return response
    res.status(200).json({
      data: hotlCatList_array,
      total: countRows[0].total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(countRows[0].total / perPage),
    });
  } catch (error) {
    console.error("Error fetching hotel categories:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.stateListWeb = async (req, res) => {
  try {
    // fetch states ordered by stateName ASC
    const [rows] = await db.query(
      "SELECT stateId, countryId, stateName, image, description FROM states ORDER BY stateName ASC"
    );

    // if empty
    if (!rows.length) {
      return res.json({ data: [] });
    }

    // map into clean array
    const stateArray = rows.map((value) => ({
      stateId: value.stateId,
      countryId: value.countryId,
      stateName: value.stateName,
      image: value.image,
      description: value.description,
    }));

    res.status(200).json({ data: stateArray });
  } catch (error) {
    console.error("Error fetching states:", error);
    res.status(400).json({ message: error.message });
  }
};

exports.country = async (req, res) => {
  try {
    let sql;
    let params = [];

    // ✅ check destinationId condition
    if (parseInt(req.query.destinationId) === 1) {
      sql = `
        SELECT c.countryId, c.continentId, c.countryName, ct.continentName
        FROM countries c
        JOIN continents ct ON c.continentId = ct.continentId
        WHERE c.countryId = 1
      `;
    } else {
      sql = `
        SELECT c.countryId, c.continentId, c.countryName, ct.continentName
        FROM countries c
        JOIN continents ct ON c.continentId = ct.continentId
        WHERE c.countryId != 1
      `;
    }

    const [rows] = await db.query(sql, params);

    // if empty
    if (!rows.length) {
      return res.json({ message: [] });
    }

    // map rows into clean array
    const countriesArray = rows.map((value) => ({
      countryId: value.countryId,
      continentId: value.continentId,
      countryName: value.countryName,
      continentName: value.continentName,
    }));

    res.status(200).json({ message: countriesArray });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.allEnquiryTodayListGt = async (req, res) => {
  try {
    // ✅ check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      202,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const todayDate = moment().format("YYYY-MM-DD");
    const currentTime = moment().format("HH:mm:ss");

    let sql = `
      SELECT e.*, g.tourName, g.startDate, g.endDate, u.userName
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      JOIN users u ON e.createdBy = u.userId
      WHERE e.enquiryProcess = 1
        AND DATE(e.nextFollowUp) = ?
        AND TIME(e.nextFollowUpTime) > ?
    `;
    let params = [todayDate, currentTime];

    // 🔍 filters
    if (req.query.startDate && req.query.endDate) {
      sql += " AND g.startDate >= ? AND g.endDate <= ? ";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      sql += " AND g.startDate >= ? ";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      sql += " AND g.endDate <= ? ";
      params.push(req.query.endDate);
    } else if (req.query.search) {
      sql += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ? ";
      params.push(`%${req.query.search}%`);
    } else if (req.query.tourName) {
      sql += " AND g.tourName LIKE ? ";
      params.push(`%${req.query.tourName}%`);
    }

    sql += " ORDER BY e.nextFollowUpTime ASC ";

    // ✅ pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    const [rows] = await db.query(sql + " LIMIT ? OFFSET ?", [
      ...params,
      perPage,
      offset,
    ]);

    // ✅ total count for pagination
    const [countRows] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      JOIN users u ON e.createdBy = u.userId
      WHERE e.enquiryProcess = 1
        AND DATE(e.nextFollowUp) = ?
        AND TIME(e.nextFollowUpTime) > ?
      `,
      [todayDate, currentTime]
    );

    // ✅ format data
    const groupTourArray = rows.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      enquiryDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      guestName: `${value.firstName} ${value.lastName}`,
      uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
      contact: value.contact,
      tourName: value.tourName,
      startDate: value.startDate,
      endDate: value.endDate,
      paxNo: value.adults + value.child,
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: value.userName,
    }));

    res.status(200).json({
      data: groupTourArray,
      total: countRows[0].total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(countRows[0].total / perPage),
    });
  } catch (error) {
    console.error("Error fetching today’s enquiries:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.allEnquiryExpiredListGt = async (req, res) => {
  try {
    // ✅ Token check
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      202,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // Pagination defaults
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // Current date & time
    const today = moment().format("YYYY-MM-DD");
    const nowTime = moment().format("HH:mm:ss");

    // ✅ Base query
    let query = `
      SELECT eg.*, 
             gt.tourName, gt.startDate, gt.endDate, 
             u.userName
      FROM enquirygrouptours eg
      JOIN grouptours gt ON eg.groupTourId = gt.groupTourId
      JOIN users u ON eg.createdBy = u.userId
      WHERE eg.enquiryProcess = 1
        AND (
          eg.nextFollowUp < ?
          OR (eg.nextFollowUp = ? AND eg.nextFollowUpTime < ?)
        )
    `;
    let params = [today, today, nowTime];

    // ✅ Filters
    if (req.query.startDate && req.query.endDate) {
      query += " AND gt.startDate >= ? AND gt.endDate <= ?";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      query += " AND gt.startDate >= ?";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      query += " AND gt.endDate <= ?";
      params.push(req.query.endDate);
    } else if (req.query.search) {
      query += " AND CONCAT(eg.firstName, ' ', eg.lastName) LIKE ?";
      params.push(`%${req.query.search}%`);
    } else if (req.query.tourName) {
      query += " AND gt.tourName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Sorting
    query += " ORDER BY eg.nextFollowUp DESC, eg.nextFollowUpTime DESC";

    // ✅ Count query for pagination
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as temp`,
      params
    );
    const total = countResult[0].total;

    // ✅ Apply pagination
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // ✅ Format response
    const groupTourArray = rows.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      enquiryDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      guestName: `${value.firstName} ${value.lastName}`,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      contact: value.contact,
      tourName: value.tourName,
      startDate: value.startDate,
      endDate: value.endDate,
      paxNo: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: value.userName,
    }));

    return res.json({
      data: groupTourArray,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl: page < Math.ceil(total / perPage) ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
    });
  } catch (err) {
    console.error("Error fetching expired enquiries:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.allEnquiryUpcomingListGt = async (req, res) => {
  try {
    // ✅ Token check
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      202,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // Today’s date
    const today = moment().format("YYYY-MM-DD");

    // ✅ Base query
    let query = `
      SELECT eg.*, 
             gt.tourName, gt.startDate, gt.endDate, 
             u.userName
      FROM enquirygrouptours eg
      JOIN grouptours gt ON eg.groupTourId = gt.groupTourId
      JOIN users u ON eg.createdBy = u.userId
      WHERE eg.enquiryProcess = 1
        AND eg.nextFollowUp > ?
    `;
    let params = [today];

    // ✅ Filters
    if (req.query.startDate && req.query.endDate) {
      query += " AND gt.startDate >= ? AND gt.endDate <= ?";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      query += " AND gt.startDate >= ?";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      query += " AND gt.endDate <= ?";
      params.push(req.query.endDate);
    } else if (req.query.search) {
      query += ` AND CONCAT(
                  COALESCE(eg.firstName, ''), ' ', 
                  COALESCE(eg.lastName, '')
                ) LIKE ?`;
      params.push(`%${req.query.search}%`);
    } else if (req.query.tourName) {
      query += " AND gt.tourName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Sorting
    query += " ORDER BY eg.nextFollowUp ASC, eg.nextFollowUpTime ASC";

    // ✅ Count query
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as temp`,
      params
    );
    const total = countResult[0].total;

    // ✅ Apply pagination
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // ✅ Format response
    const groupTourArray = rows.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
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
      userName: value.userName,
    }));

    return res.json({
      data: groupTourArray,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl: page < Math.ceil(total / perPage) ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
    });
  } catch (err) {
    console.error("Error fetching upcoming enquiries:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.allEnqTodayCt = async (req, res) => {
  try {
    // ✅ Token check
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      237,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    const today = moment().format("YYYY-MM-DD");
    const currentTime = moment().format("HH:mm:ss");

    // ✅ Base query
    let query = `
      SELECT ect.*, 
             dd.destinationName, 
             u.userName, 
             assignee.userName AS assignToName
      FROM enquirycustomtours ect
      JOIN dropdowndestination dd ON ect.destinationId = dd.destinationId
      JOIN users u ON ect.createdBy = u.userId
      LEFT JOIN users assignee ON ect.assignTo = assignee.userId
      WHERE ect.enquiryProcess = 1
        AND DATE(ect.nextFollowUp) = ?
        AND TIME(ect.nextFollowUpTime) > ?
    `;
    let params = [today, currentTime];

    // ✅ Filters
    if (req.query.startDate && req.query.endDate) {
      query += " AND ect.startDate >= ? AND ect.endDate <= ?";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      query += " AND ect.startDate >= ?";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      query += " AND ect.endDate <= ?";
      params.push(req.query.endDate);
    } else if (req.query.tourName) {
      query += " AND ect.groupName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    } else if (req.query.search) {
      query += " AND CONCAT(ect.firstName, ' ', ect.lastName) LIKE ?";
      params.push(`%${req.query.search}%`);
    }

    // ✅ Sorting
    query += " ORDER BY ect.nextFollowUpTime ASC";

    // ✅ Count total
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as temp`,
      params
    );
    const total = countResult[0].total;

    // ✅ Pagination
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // ✅ Format response
    const enquiryCustomArray = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: value.userName,
      assignToName: value.assignToName ? value.assignToName : "-",
    }));

    return res.json({
      data: enquiryCustomArray,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl: page < Math.ceil(total / perPage) ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
    });
  } catch (err) {
    console.error("Error fetching custom enquiries today:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ===================== allEnqUpcomingCt =====================
exports.allEnqUpcomingCt = async (req, res) => {
  try {
    // ✅ check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      237,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let {
      startDate,
      endDate,
      groupName,
      guestName,
      perPage = 10,
      page = 1,
    } = req.query;

    perPage = parseInt(perPage);
    page = parseInt(page);
    const offset = (page - 1) * perPage;

    // ✅ base query
    let conditions = [
      "enquirycustomtours.enquiryProcess = 1",
      "enquirycustomtours.nextFollowUp > CURDATE()",
    ];
    let values = [];

    // ✅ filters
    if (startDate && endDate) {
      conditions.push(
        "enquirycustomtours.startDate >= ? AND enquirycustomtours.endDate <= ?"
      );
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }
    if (startDate) {
      conditions.push("enquirycustomtours.startDate >= ?");
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
    }
    if (endDate) {
      conditions.push("enquirycustomtours.endDate <= ?");
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }
    if (groupName) {
      conditions.push("enquirycustomtours.groupName LIKE ?");
      values.push(`%${groupName}%`);
    }
    if (guestName) {
      conditions.push(
        "CONCAT(COALESCE(enquirycustomtours.firstName,''),' ',COALESCE(enquirycustomtours.lastName,'')) LIKE ?"
      );
      values.push(`%${guestName}%`);
    }

    let whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // ✅ main query
    const [rows] = await db.query(
      `
      SELECT enquirycustomtours.*, dropdowndestination.destinationName,
             users.userName, assignee.userName as assignToName
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      JOIN users ON enquirycustomtours.createdBy = users.userId
      LEFT JOIN users as assignee ON enquirycustomtours.assignTo = assignee.userId
      ${whereClause}
      ORDER BY enquirycustomtours.nextFollowUp ASC, enquirycustomtours.nextFollowUpTime ASC
      LIMIT ? OFFSET ?
      `,
      [...values, perPage, offset]
    );

    // ✅ count query
    const [countResult] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      JOIN users ON enquirycustomtours.createdBy = users.userId
      LEFT JOIN users as assignee ON enquirycustomtours.assignTo = assignee.userId
      ${whereClause}
      `,
      values
    );

    const total = countResult[0].total;

    // ✅ format data
    const data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      remark: value.remark,
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: value.userName,
      assignToName: value.assignToName ? value.assignToName : "-",
    }));

    return res.json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching upcoming enquiries:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ===================== allEnqExpiredCt =====================
exports.allEnqExpiredCt = async (req, res) => {
  try {
    // ✅ check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      237,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let {
      startDate,
      endDate,
      tourName,
      search,
      perPage = 10,
      page = 1,
    } = req.query;

    perPage = parseInt(perPage);
    page = parseInt(page);
    const offset = (page - 1) * perPage;

    // ✅ base query
    let conditions = [
      "enquirycustomtours.enquiryProcess = 1",
      `(DATE(enquirycustomtours.nextFollowUp) < CURDATE() 
        OR (DATE(enquirycustomtours.nextFollowUp) = CURDATE() 
            AND TIME(enquirycustomtours.nextFollowUpTime) < CURTIME()))`,
    ];
    let values = [];

    // ✅ filters
    if (startDate && endDate) {
      conditions.push(
        "enquirycustomtours.startDate >= ? AND enquirycustomtours.endDate <= ?"
      );
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    } else if (startDate) {
      conditions.push("enquirycustomtours.startDate >= ?");
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
    } else if (endDate) {
      conditions.push("enquirycustomtours.endDate <= ?");
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }
    if (tourName) {
      conditions.push("enquirycustomtours.groupName LIKE ?");
      values.push(`%${tourName}%`);
    }
    if (search) {
      conditions.push(
        "CONCAT(enquirycustomtours.firstName,' ',enquirycustomtours.lastName) LIKE ?"
      );
      values.push(`%${search}%`);
    }

    let whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // ✅ main query
    const [rows] = await db.query(
      `
      SELECT enquirycustomtours.*, dropdowndestination.destinationName,
             users.userName, assignee.userName as assignToName
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      JOIN users ON enquirycustomtours.createdBy = users.userId
      LEFT JOIN users as assignee ON enquirycustomtours.assignTo = assignee.userId
      ${whereClause}
      ORDER BY enquirycustomtours.nextFollowUp DESC, enquirycustomtours.nextFollowUpTime DESC
      LIMIT ? OFFSET ?
      `,
      [...values, perPage, offset]
    );

    // ✅ count query
    const [countResult] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      JOIN users ON enquirycustomtours.createdBy = users.userId
      LEFT JOIN users as assignee ON enquirycustomtours.assignTo = assignee.userId
      ${whereClause}
      `,
      values
    );

    const total = countResult[0].total;

    // ✅ format data
    const data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: value.userName,
      assignToName: value.assignToName ? value.assignToName : "-",
    }));

    return res.json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching expired enquiries:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ===================== assignedCustomTourList =====================
exports.assignedCustomTourList = async (req, res) => {
  try {
    // ✅ check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      353,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let {
      startDate,
      endDate,
      tourName,
      search,
      perPage = 10,
      page = 1,
    } = req.query;

    perPage = parseInt(perPage);
    page = parseInt(page);
    const offset = (page - 1) * perPage;

    // ✅ base conditions
    let conditions = [
      "enquirycustomtours.enquiryProcess = 1",
      "DATE(enquirycustomtours.nextFollowUp) = CURDATE()",
      "TIME(enquirycustomtours.nextFollowUpTime) > CURTIME()",
      "enquirycustomtours.assignTo = ?",
    ];
    let values = [tokenData.userId];

    // ✅ filters
    if (startDate && endDate) {
      conditions.push(
        "enquirycustomtours.startDate >= ? AND enquirycustomtours.endDate <= ?"
      );
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    } else if (startDate) {
      conditions.push("enquirycustomtours.startDate >= ?");
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
    } else if (endDate) {
      conditions.push("enquirycustomtours.endDate <= ?");
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }

    if (tourName) {
      conditions.push("enquirycustomtours.groupName LIKE ?");
      values.push(`%${tourName}%`);
    }
    if (search) {
      conditions.push(
        "CONCAT(enquirycustomtours.firstName,' ',enquirycustomtours.lastName) LIKE ?"
      );
      values.push(`%${search}%`);
    }

    let whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // ✅ main query
    const [rows] = await db.query(
      `
      SELECT enquirycustomtours.*, dropdowndestination.destinationName
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      ${whereClause}
      ORDER BY enquirycustomtours.nextFollowUpTime ASC
      LIMIT ? OFFSET ?
      `,
      [...values, perPage, offset]
    );

    // ✅ count query
    const [countResult] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      ${whereClause}
      `,
      values
    );

    const total = countResult[0].total;

    // ✅ format data
    const data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: tokenData.userName,
    }));

    return res.json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching assigned custom tours:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ===================== assignedUpcomingCustomTourList =====================
exports.assignedUpcomingCustomTourList = async (req, res) => {
  try {
    // ✅ check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      353,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let {
      startDate,
      endDate,
      tourName,
      search,
      perPage = 10,
      page = 1,
    } = req.query;

    perPage = parseInt(perPage);
    page = parseInt(page);
    const offset = (page - 1) * perPage;

    // ✅ base conditions
    let conditions = [
      "enquirycustomtours.enquiryProcess = 1",
      "enquirycustomtours.nextFollowUp > CURDATE()",
      "enquirycustomtours.assignTo = ?",
    ];
    let values = [tokenData.userId];

    // ✅ filters
    if (startDate && endDate) {
      conditions.push(
        "enquirycustomtours.startDate >= ? AND enquirycustomtours.endDate <= ?"
      );
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    } else if (startDate) {
      conditions.push("enquirycustomtours.startDate >= ?");
      values.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
    } else if (endDate) {
      conditions.push("enquirycustomtours.endDate <= ?");
      values.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }

    if (tourName) {
      conditions.push("enquirycustomtours.groupName LIKE ?");
      values.push(`%${tourName}%`);
    }
    if (search) {
      conditions.push(
        "CONCAT(enquirycustomtours.firstName,' ',enquirycustomtours.lastName) LIKE ?"
      );
      values.push(`%${search}%`);
    }

    let whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // ✅ main query
    const [rows] = await db.query(
      `
      SELECT enquirycustomtours.*, dropdowndestination.destinationName
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      ${whereClause}
      ORDER BY enquirycustomtours.nextFollowUp ASC, enquirycustomtours.nextFollowUpTime ASC
      LIMIT ? OFFSET ?
      `,
      [...values, perPage, offset]
    );

    // ✅ count query
    const [countResult] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      ${whereClause}
      `,
      values
    );

    const total = countResult[0].total;

    // ✅ format data
    const data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: (value.adults || 0) + (value.child || 0),
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      remark: value.remark,
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: tokenData.userName,
    }));

    return res.json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching assigned upcoming custom tours:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ===================== assignedExpiredCustomTourList =====================

// exports.assignedExpiredCustomTourList = async (req, res) => {
//   try {
//     // ✅ Check token
//     const tokenData = await CommonController.checkToken(req.headers["token"], [353]);
//     if (tokenData.error) return res.status(401).json(tokenData);

//     const today = moment().format("YYYY-MM-DD");
//     const nowTime = moment().format("HH:mm:ss");

//     // Base query
//     let query = `
//       SELECT e.*, d.destinationName
//       FROM enquirycustomtours e
//       JOIN dropdowndestination d ON e.destinationId = d.destinationId
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo = ?
//         AND (
//           DATE(e.nextFollowUp) < ?
//           OR (DATE(e.nextFollowUp) = ? AND TIME(e.nextFollowUpTime) < ?)
//         )
//     `;
//     let params = [tokenData.userId, today, today, nowTime];

//     // ✅ Filters
//     const { startDate, endDate, tourName, search } = req.query;

//     if (startDate && startDate.trim() && endDate && endDate.trim()) {
//       query += " AND e.startDate >= ? AND e.endDate <= ?";
//       params.push(startDate, endDate);
//     } else if (startDate && startDate.trim()) {
//       query += " AND e.startDate >= ?";
//       params.push(startDate);
//     } else if (endDate && endDate.trim()) {
//       query += " AND e.endDate <= ?";
//       params.push(endDate);
//     }

//     if (tourName && tourName.trim()) {
//       query += " AND e.groupName LIKE ?";
//       params.push(`%${tourName}%`);
//     }

//     if (search && search.trim()) {
//       query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       params.push(`%${search}%`);
//     }

//     query += " ORDER BY e.nextFollowUp DESC, e.nextFollowUpTime DESC";

//     // ✅ Pagination
//     const perPage = parseInt(req.query.perPage) || 10;
//     const page = parseInt(req.query.page) || 1;
//     const offset = (page - 1) * perPage;
//     query += " LIMIT ? OFFSET ?";
//     params.push(perPage, offset);

//     // Debugging logs
//     console.log("SQL Query:", query);
//     console.log("Params:", params);

//     // Execute main query
//     const [rows] = await db.execute(query, params);

//     const enquiryCustomArray = rows.map((value) => ({
//       enquiryCustomId: value.enquiryCustomId,
//       uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
//       enqDate: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       groupName: value.groupName || "",
//       contactName: `${value.firstName || ""} ${value.lastName || ""}`,
//       startDate: value.startDate ? moment(value.startDate).format("DD-MM-YYYY") : "",
//       endDate: value.endDate ? moment(value.endDate).format("DD-MM-YYYY") : "",
//       contact: value.contact || "",
//       destinationName: value.destinationName || "",
//       pax: (value.adults || 0) + (value.child || 0),
//       lastFollowUp: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       nextFollowUp: value.nextFollowUp ? moment(value.nextFollowUp).format("DD-MM-YYYY") : "",
//       nextFollowUpTime: value.nextFollowUpTime || "",
//       userName: tokenData.userName,
//     }));

//     // ✅ Count query for pagination
//     let countQuery = `
//       SELECT COUNT(*) as total
//       FROM enquirycustomtours e
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo = ?
//         AND (
//           DATE(e.nextFollowUp) < ?
//           OR (DATE(e.nextFollowUp) = ? AND TIME(e.nextFollowUpTime) < ?)
//         )
//     `;
//     let countParams = [tokenData.userId, today, today, nowTime];

//     if (startDate && startDate.trim() && endDate && endDate.trim()) {
//       countQuery += " AND e.startDate >= ? AND e.endDate <= ?";
//       countParams.push(startDate, endDate);
//     } else if (startDate && startDate.trim()) {
//       countQuery += " AND e.startDate >= ?";
//       countParams.push(startDate);
//     } else if (endDate && endDate.trim()) {
//       countQuery += " AND e.endDate <= ?";
//       countParams.push(endDate);
//     }

//     if (tourName && tourName.trim()) {
//       countQuery += " AND e.groupName LIKE ?";
//       countParams.push(`%${tourName}%`);
//     }

//     if (search && search.trim()) {
//       countQuery += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       countParams.push(`%${search}%`);
//     }

//     const [countRows] = await db.execute(countQuery, countParams);

//     // ✅ Response
//     return res.status(200).json({
//       data: enquiryCustomArray,
//       total: countRows[0].total,
//       currentPage: page,
//       perPage: perPage,
//       nextPageUrl: page * perPage < countRows[0].total ? page + 1 : null,
//       previousPageUrl: page > 1 ? page - 1 : null,
//       lastPage: Math.ceil(countRows[0].total / perPage),
//     });

//   } catch (error) {
//     console.error("Error fetching assigned expired custom tours:", error);
//     return res.status(500).json({ message: error.message });
//   }
// };

// Helper function to safely handle query parameters

// ==================== ASSIGNED CUSTOM TOUR LIST ====================
// exports.assignedCustomTour = async (req, res) => {
//   try {
//     // check token
//     const tokenData = await CommonController.checkToken(req.headers["token"], [353]);
//     if (tokenData.error) {
//       return res.status(401).json(tokenData);
//     }

//     const today = moment().format("YYYY-MM-DD");
//     const nowTime = moment().format("HH:mm:ss");

//     let query = `
//       SELECT e.*, d.destinationName
//       FROM enquirycustomtours e
//       JOIN dropdowndestination d ON e.destinationId = d.destinationId
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo = ?
//         AND DATE(e.nextFollowUp) = ?
//         AND TIME(e.nextFollowUpTime) > ?
//     `;
//     let params = [tokenData.userId, today, nowTime];

//     // Filters
//     const { startDate, endDate, tourName, search } = req.query;

//     if (startDate && endDate) {
//       query += " AND e.startDate >= ? AND e.endDate <= ?";
//       params.push(startDate, endDate);
//     } else if (startDate) {
//       query += " AND e.startDate >= ?";
//       params.push(startDate);
//     } else if (endDate) {
//       query += " AND e.endDate <= ?";
//       params.push(endDate);
//     }

//     if (tourName) {
//       query += " AND e.groupName LIKE ?";
//       params.push(`%${tourName}%`);
//     }

//     if (search) {
//       query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       params.push(`%${search}%`);
//     }

//     query += " ORDER BY e.nextFollowUpTime ASC";

//     // Pagination
//     const perPage = parseInt(req.query.perPage, 10) || 10;
//     const page = parseInt(req.query.page, 10) || 1;
//     const offset = (page - 1) * perPage;
//     query += " LIMIT ? OFFSET ?";
//     params.push(perPage, offset);

//     // Safety check: no undefined params
//     if (params.some(v => v === undefined)) {
//       throw new Error("One or more SQL parameters are undefined");
//     }

//     const [rows] = await db.execute(query, params);

//     const data = rows.map((value) => ({
//       enquiryCustomId: value.enquiryCustomId,
//       uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
//       enqDate: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       groupName: value.groupName || "",
//       contactName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
//       startDate: value.startDate ? moment(value.startDate).format("DD-MM-YYYY") : "",
//       endDate: value.endDate ? moment(value.endDate).format("DD-MM-YYYY") : "",
//       contact: value.contact || "",
//       destinationName: value.destinationName || "",
//       pax: (value.adults || 0) + (value.child || 0),
//       lastFollowUp: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       nextFollowUp: value.nextFollowUp ? moment(value.nextFollowUp).format("DD-MM-YYYY") : "",
//       nextFollowUpTime: value.nextFollowUpTime || "",
//       userName: tokenData.userName,
//     }));

//     // Total count for pagination
//     let countQuery = `
//       SELECT COUNT(*) as total
//       FROM enquirycustomtours e
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo = ?
//         AND DATE(e.nextFollowUp) = ?
//         AND TIME(e.nextFollowUpTime) > ?
//     `;
//     let countParams = [tokenData.userId, today, nowTime];

//     if (startDate && endDate) {
//       countQuery += " AND e.startDate >= ? AND e.endDate <= ?";
//       countParams.push(startDate, endDate);
//     } else if (startDate) {
//       countQuery += " AND e.startDate >= ?";
//       countParams.push(startDate);
//     } else if (endDate) {
//       countQuery += " AND e.endDate <= ?";
//       countParams.push(endDate);
//     }

//     if (tourName) {
//       countQuery += " AND e.groupName LIKE ?";
//       countParams.push(`%${tourName}%`);
//     }

//     if (search) {
//       countQuery += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       countParams.push(`%${search}%`);
//     }

//     if (countParams.some(v => v === undefined)) {
//       throw new Error("One or more SQL parameters in count query are undefined");
//     }

//     const [countRows] = await db.execute(countQuery, countParams);
//     const total = countRows[0]?.total || 0;

//     return res.status(200).json({
//       data,
//       total,
//       currentPage: page,
//       perPage,
//       nextPageUrl: page * perPage < total ? page + 1 : null,
//       previousPageUrl: page > 1 ? page - 1 : null,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("Error fetching assigned custom tours:", error);
//     return res.status(500).json({ message: error.message });
//   }
// };

// // ==================== ASSIGNED ALL UPCOMING CUSTOM TOUR LIST ====================
// exports.assignedUpcomingCustomTour = async (req, res) => {
//   try {
//     // Check token
//     const tokenData = await CommonController.checkToken(req.headers["token"], [358]);
//     if (tokenData.error) {
//       return res.status(401).json(tokenData);
//     }

//     const today = moment().format("YYYY-MM-DD");

//     let query = `
//       SELECT e.*, d.destinationName, u.userName
//       FROM enquirycustomtours e
//       JOIN dropdowndestination d ON e.destinationId = d.destinationId
//       JOIN users u ON e.assignTo = u.userId
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo IS NOT NULL
//         AND e.nextFollowUp > ?
//     `;
//     let params = [today];

//     // Filters
//     const { startDate, endDate, tourName, search } = req.query;

//     if (startDate && endDate) {
//       query += " AND e.startDate >= ? AND e.endDate <= ?";
//       params.push(startDate, endDate);
//     } else if (startDate) {
//       query += " AND e.startDate >= ?";
//       params.push(startDate);
//     } else if (endDate) {
//       query += " AND e.endDate <= ?";
//       params.push(endDate);
//     }

//     if (tourName) {
//       query += " AND e.groupName LIKE ?";
//       params.push(`%${tourName}%`);
//     }

//     if (search) {
//       query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       params.push(`%${search}%`);
//     }

//     // Ordering
//     query += " ORDER BY e.nextFollowUp ASC, e.nextFollowUpTime ASC";

//     // Pagination
//     const perPage = parseInt(req.query.perPage, 10) || 10;
//     const page = parseInt(req.query.page, 10) || 1;
//     const offset = (page - 1) * perPage;
//     query += " LIMIT ? OFFSET ?";
//     params.push(perPage, offset);

//     // Safety check: no undefined params
//     if (params.some(v => v === undefined)) {
//       throw new Error("One or more SQL parameters are undefined");
//     }

//     const [rows] = await db.execute(query, params);

//     const data = rows.map((value) => ({
//       enquiryCustomId: value.enquiryCustomId,
//       uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
//       enqDate: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       groupName: value.groupName || "",
//       contactName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
//       startDate: value.startDate ? moment(value.startDate).format("DD-MM-YYYY") : "",
//       endDate: value.endDate ? moment(value.endDate).format("DD-MM-YYYY") : "",
//       contact: value.contact || "",
//       destinationName: value.destinationName || "",
//       pax: (value.adults || 0) + (value.child || 0),
//       lastFollowUp: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       remark: value.remark || "",
//       nextFollowUp: value.nextFollowUp ? moment(value.nextFollowUp).format("DD-MM-YYYY") : "",
//       nextFollowUpTime: value.nextFollowUpTime || "",
//       userName: value.userName || "",
//     }));

//     // Total count for pagination
//     let countQuery = `
//       SELECT COUNT(*) as total
//       FROM enquirycustomtours e
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo IS NOT NULL
//         AND e.nextFollowUp > ?
//     `;
//     let countParams = [today];

//     if (startDate && endDate) {
//       countQuery += " AND e.startDate >= ? AND e.endDate <= ?";
//       countParams.push(startDate, endDate);
//     } else if (startDate) {
//       countQuery += " AND e.startDate >= ?";
//       countParams.push(startDate);
//     } else if (endDate) {
//       countQuery += " AND e.endDate <= ?";
//       countParams.push(endDate);
//     }

//     if (tourName) {
//       countQuery += " AND e.groupName LIKE ?";
//       countParams.push(`%${tourName}%`);
//     }

//     if (search) {
//       countQuery += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       countParams.push(`%${search}%`);
//     }

//     if (countParams.some(v => v === undefined)) {
//       throw new Error("One or more SQL parameters in count query are undefined");
//     }

//     const [countRows] = await db.execute(countQuery, countParams);
//     const total = countRows[0]?.total || 0;

//     return res.status(200).json({
//       data,
//       total,
//       currentPage: page,
//       perPage,
//       nextPageUrl: page * perPage < total ? page + 1 : null,
//       previousPageUrl: page > 1 ? page - 1 : null,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("Error fetching upcoming custom tours:", error);
//     return res.status(500).json({ message: error.message });
//   }
// };

// ==================== ASSIGNED EXPIRED CUSTOM TOUR LIST ====================
// exports.assignedExpiredCustomTour = async (req, res) => {
//   try {
//     const tokenData = await CommonController.checkToken(req.headers["token"], [353]);
//     if (tokenData.error) {
//       return res.status(401).json(tokenData);
//     }

//     const today = moment().format("YYYY-MM-DD");
//     const nowTime = moment().format("HH:mm:ss");

//     let query = `
//       SELECT e.*, d.destinationName
//       FROM enquirycustomtours e
//       JOIN dropdowndestination d ON e.destinationId = d.destinationId
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo = ?
//         AND (DATE(e.nextFollowUp) < ? OR (DATE(e.nextFollowUp) = ? AND TIME(e.nextFollowUpTime) < ?))
//     `;
//     let params = [tokenData.userId, today, today, nowTime];

//     // Filters
//     const { startDate, endDate, tourName, search } = req.query;

//     if (startDate && endDate) {
//       query += " AND e.startDate >= ? AND e.endDate <= ?";
//       params.push(startDate, endDate);
//     } else if (startDate) {
//       query += " AND e.startDate >= ?";
//       params.push(startDate);
//     } else if (endDate) {
//       query += " AND e.endDate <= ?";
//       params.push(endDate);
//     }

//     if (tourName) {
//       query += " AND e.groupName LIKE ?";
//       params.push(`%${tourName}%`);
//     }

//     if (search) {
//       query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       params.push(`%${search}%`);
//     }

//     query += " ORDER BY e.nextFollowUp DESC, e.nextFollowUpTime DESC";

//     // Pagination
//     const perPage = parseInt(req.query.perPage, 10) || 10;
//     const page = parseInt(req.query.page, 10) || 1;
//     const offset = (page - 1) * perPage;
//     query += " LIMIT ? OFFSET ?";
//     params.push(perPage, offset);

//     // Safety check: no undefined params
//     if (params.some(v => v === undefined)) {
//       throw new Error("One or more SQL parameters are undefined");
//     }

//     const [rows] = await db.execute(query, params);

//     const data = rows.map((value) => ({
//       enquiryCustomId: value.enquiryCustomId,
//       uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
//       enqDate: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       groupName: value.groupName || "",
//       contactName: `${value.firstName || ""} ${value.lastName || ""}`.trim(),
//       startDate: value.startDate ? moment(value.startDate).format("DD-MM-YYYY") : "",
//       endDate: value.endDate ? moment(value.endDate).format("DD-MM-YYYY") : "",
//       contact: value.contact || "",
//       destinationName: value.destinationName || "",
//       pax: (value.adults || 0) + (value.child || 0),
//       lastFollowUp: value.created_at ? moment(value.created_at).format("DD-MM-YYYY") : "",
//       nextFollowUp: value.nextFollowUp ? moment(value.nextFollowUp).format("DD-MM-YYYY") : "",
//       nextFollowUpTime: value.nextFollowUpTime || "",
//       userName: tokenData.userName,
//     }));

//     // Total count query with same filters
//     let countQuery = `
//       SELECT COUNT(*) as total
//       FROM enquirycustomtours e
//       WHERE e.enquiryProcess = 1
//         AND e.assignTo = ?
//         AND (DATE(e.nextFollowUp) < ? OR (DATE(e.nextFollowUp) = ? AND TIME(e.nextFollowUpTime) < ?))
//     `;
//     let countParams = [tokenData.userId, today, today, nowTime];

//     if (startDate && endDate) {
//       countQuery += " AND e.startDate >= ? AND e.endDate <= ?";
//       countParams.push(startDate, endDate);
//     } else if (startDate) {
//       countQuery += " AND e.startDate >= ?";
//       countParams.push(startDate);
//     } else if (endDate) {
//       countQuery += " AND e.endDate <= ?";
//       countParams.push(endDate);
//     }

//     if (tourName) {
//       countQuery += " AND e.groupName LIKE ?";
//       countParams.push(`%${tourName}%`);
//     }

//     if (search) {
//       countQuery += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       countParams.push(`%${search}%`);
//     }

//     if (countParams.some(v => v === undefined)) {
//       throw new Error("One or more SQL parameters in count query are undefined");
//     }

//     const [countRows] = await db.execute(countQuery, countParams);
//     const total = countRows[0]?.total || 0;

//     return res.status(200).json({
//       data,
//       total,
//       currentPage: page,
//       perPage,
//       nextPageUrl: page * perPage < total ? page + 1 : null,
//       previousPageUrl: page > 1 ? page - 1 : null,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("Error fetching expired custom tours:", error);
//     return res.status(500).json({ message: error.message });
//   }
// };

// ==================== CONTACT US LIST ====================

exports.contactUsList = async (req, res) => {
  try {
    // Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      310,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // Pagination parameters
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // Fetch data - Note: Inject numbers directly instead of using `?`
    const [rows] = await db.execute(
      `SELECT * FROM contactusers ORDER BY id DESC LIMIT ${perPage} OFFSET ${offset}`
    );

    const data = rows.map((value) => ({
      id: value.id,
      fullName: value.fullName,
      phoneNo: value.phoneNo,
      date: value.created_at,
    }));

    // Total count
    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM contactusers`
    );
    const total = countRows[0].total;

    return res.status(200).json({
      data,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("Error fetching contact us list:", error);
    return res.status(500).json({ message: error.message });
  }
};
exports.getHomePageJourney = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      308,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Fetch tours
    const [rows] = await db.execute("SELECT * FROM homepagejourneytour");

    // ✅ Format data
    const data = rows.map((row) => ({
      groupTourId: row.groupTourId,
    }));

    return res.status(200).json({ data });
  } catch (error) {
    console.error("Error fetching homepage journey tours:", error);
    return res.status(500).json({ message: error.message });
  }
};
exports.groupTourListDropdown = async (req, res) => {
  try {
    // ✅ Fetch group tours
    const [rows] = await db.execute(
      "SELECT * FROM grouptours ORDER BY groupTourId DESC"
    );

    // ✅ Format data
    const data = rows.map((row) => ({
      groupTourId: row.groupTourId,
      tourName: `${row.tourName || ""}-${row.tourCode || ""}`,
    }));

    return res.status(200).json({ data });
  } catch (error) {
    console.error("Error fetching group tours:", error);
    return res.status(500).json({ message: error.message });
  }
};

exports.addHomePageJourney = async (req, res) => {
  try {
    // ✅ Validate request body
    const schema = Joi.object({
      groupTourIds: Joi.array()
        .items(Joi.number().integer())
        .required()
        .messages({
          "any.required": "The tour field is mandatory.",
          "array.base": "The tour must be an array.",
        }),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((d) => d.message) });
    }

    const { groupTourIds } = value;

    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      308,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Delete existing homepage journey tours
    await db.execute("DELETE FROM homepagejourneytour");

    // ✅ Prepare new tours to insert
    const tourData = [];
    for (const id of groupTourIds) {
      const [rows] = await db.execute(
        "SELECT * FROM grouptours WHERE groupTourId = ?",
        [id]
      );
      if (!rows.length) {
        return res
          .status(404)
          .json({ message: `Group Tour Not Found for ID ${id}` });
      }
      // Provide both values: groupTourId and clientcode (replace with actual clientcode)
      tourData.push([id, "DEFAULT_CLIENT_CODE"]);
    }

    if (tourData.length === 0) {
      return res
        .status(404)
        .json({ message: "Home Page Journey Tour array is empty" });
    }

    // ✅ Insert new tours
    const [result] = await db.query(
      "INSERT INTO homepagejourneytour (groupTourId, clientcode) VALUES ?",
      [tourData]
    );

    if (!result.affectedRows) {
      return res
        .status(500)
        .json({ message: "Home Page Journey Tour not added" });
    }

    return res.status(200).json({ message: "Home Page Journey Tour added" });
  } catch (err) {
    console.error("Error adding home page journey:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== TOP FIVE GROUP JOURNEYS LIST ====================
exports.topFiveGroupJourneysList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      344,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Fetch top five group journeys
    const [rows] = await db.execute("SELECT * FROM topfivegroupjourneys");

    // ✅ Prepare response array
    const groupJourneyArray = rows.map((value) => ({
      topFiveGroupJourneyId: value.topFiveGroupJourneyId,
      topFiveGroupJourneyImageUrl: value.topFiveGroupJourneyImageUrl,
      topFiveGroupJourneyPathUrl: value.topFiveGroupJourneyPathUrl,
    }));

    return res.status(200).json({ data: groupJourneyArray });
  } catch (err) {
    console.error("Error fetching top five group journeys:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ==================== REVIEW LIST ====================
// ==================== REVIEW LIST ====================
exports.reviewList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      340,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Fetch reviews with pagination
    const [rows] = await db.query(
      "SELECT * FROM reviews ORDER BY reviewId DESC LIMIT ? OFFSET ?",
      [perPage, offset] // pass as array
    );

    // Prepare response
    const reviewArray = rows.map((value) => ({
      reviewId: value.reviewId,
      tourCode: value.tourCode,
      tourName: value.tourName,
      tourDate: value.tourDate,
      imageUrl: value.imageUrl,
      title: value.title,
      rating: value.rating,
      content: value.content,
      customerName: value.customerName,
      type: value.type,
    }));

    // ✅ Total count for pagination
    const [countRows] = await db.query("SELECT COUNT(*) as total FROM reviews");
    const total = countRows[0].total;

    return res.status(200).json({
      data: reviewArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching review list:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== LIST OFFICE DETAILS ====================
exports.listOfficeDetails = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      335,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Fetch office details with pagination
    const [rows] = await db.query(
      "SELECT * FROM officedetails ORDER BY officedetailId DESC LIMIT ? OFFSET ?",
      [perPage, offset]
    );

    // Prepare response array
    const officeArray = rows.map((value) => ({
      officedetailId: value.officedetailId,
      cityName: value.cityName,
      address: value.address,
      officeTiming: value.officeTiming,
      contactNo: value.contactNo,
      email: value.email,
    }));

    // ✅ Total count for pagination
    const [countRows] = await db.query(
      "SELECT COUNT(*) as total FROM officedetails"
    );
    const total = countRows[0].total;

    return res.status(200).json({
      data: officeArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl: page * perPage < total ? page + 1 : null,
      previousPageUrl: page > 1 ? page - 1 : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching office details:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== EDIT OFFICE DETAILS ====================
exports.editOfficeDetails = async (req, res) => {
  try {
    // ✅ Validate query parameter
    const schema = Joi.object({
      officedetailId: Joi.number().integer().required().messages({
        "any.required": "officedetailId is required",
        "number.base": "officedetailId must be a number",
      }),
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((d) => d.message) });
    }

    const { officedetailId } = value;

    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      338,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Fetch office details by ID
    const [rows] = await db.execute(
      "SELECT * FROM officedetails WHERE officedetailId = ?",
      [officedetailId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Office Details Not Found" });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (err) {
    console.error("Error fetching office details:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== UPDATE OFFICE DETAILS ====================
exports.updateOfficeDetails = async (req, res) => {
  try {
    const schema = Joi.object({
      officedetailId: Joi.number().integer().required(),
      cityName: Joi.string().allow("").optional(),
      address: Joi.string().allow("").optional(),
      officeTiming: Joi.string().allow("").optional(),
      contactNo: Joi.string().allow("").optional(),
      email: Joi.string().email().allow("").optional(),
      clientcode: Joi.string().allow("").optional(),
      created_at: Joi.date().optional(),
      updated_at: Joi.date().optional(), // <-- allow updated_at
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ message: error.details.map((d) => d.message) });
    }

    const {
      officedetailId,
      cityName,
      address,
      officeTiming,
      contactNo,
      email,
    } = value;

    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      338,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Check if office details exist
    const [rows] = await db.execute(
      "SELECT * FROM officedetails WHERE officedetailId = ?",
      [officedetailId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Office Details Not Found" });
    }

    // ✅ Update office details
    const [result] = await db.execute(
      `UPDATE officedetails 
       SET cityName = ?, address = ?, officeTiming = ?, contactNo = ?, email = ? 
       WHERE officedetailId = ?`,
      [cityName, address, officeTiming, contactNo, email, officedetailId]
    );

    return res
      .status(200)
      .json({ message: "Office Details Updated Successfully" });
  } catch (err) {
    console.error("Error updating office details:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ==================== FEEDBACK LIST ====================
exports.feedbackList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // ensure integer
    const perPage = parseInt(req.query.perPage) || 10; // ensure integer
    const offset = (page - 1) * perPage;

    // ✅ Fetch total count
    const [totalResult] = await db.execute(
      "SELECT COUNT(*) AS total FROM feedback"
    );
    const total = totalResult[0].total;

    // ✅ Fetch paginated rows
    const [rows] = await db.query(
      "SELECT * FROM feedback ORDER BY id DESC LIMIT ? OFFSET ?",
      [perPage, offset] // both must be numbers
    );

    // ✅ Map rows to response
    const feedbackList_array = rows.map((value) => ({
      tourName: value.tourName,
      name: value.name,
      email: value.email,
      contact: value.contact,
      startDate: value.startDate,
      endDate: value.endDate,
      feedback: value.feedback,
    }));

    const lastPage = Math.ceil(total / perPage);
    const nextPageUrl =
      page < lastPage
        ? `/api/feedbacks-list?page=${page + 1}&perPage=${perPage}`
        : null;
    const previousPageUrl =
      page > 1
        ? `/api/feedbacks-list?page=${page - 1}&perPage=${perPage}`
        : null;

    return res.status(200).json({
      data: feedbackList_array,
      total,
      currentPage: page,
      perPage,
      nextPageUrl,
      previousPageUrl,
      lastPage,
    });
  } catch (err) {
    console.error("Error fetching feedback list:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== COUPONS LIST ====================
exports.couponsList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      83,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Pagination params
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // ✅ Fetch total count
    const [totalResult] = await db.execute(
      "SELECT COUNT(*) AS total FROM coupons WHERE couponType = 1"
    );
    const total = totalResult[0].total;

    // ✅ Fetch paginated rows
    const [rows] = await db.query(
      "SELECT * FROM coupons WHERE couponType = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [perPage, offset]
    );

    // ✅ Map rows
    const couponsListArray = rows.map((value) => ({
      couponId: value.couponId,
      couponName: value.couponName,
      fromDate: value.fromDate,
      toDate: value.toDate,
      status: value.status,
      statusDescription: "1-active, 0-inactive",
      discountType: value.discountType,
      discountTypeDescription: "1-fixed amount, 2- percentage",
      discountValue: value.discountValue,
      maxDiscount: value.maxDiscount,
      isType: value.isType,
      isTypeDescription: "1-all users, 2-new users",
    }));

    const lastPage = Math.ceil(total / perPage);
    const nextPageUrl =
      page < lastPage
        ? `/api/coupons-list?page=${page + 1}&perPage=${perPage}`
        : null;
    const previousPageUrl =
      page > 1 ? `/api/coupons-list?page=${page - 1}&perPage=${perPage}` : null;

    return res.status(200).json({
      data: couponsListArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl,
      previousPageUrl,
      lastPage,
    });
  } catch (err) {
    console.error("Error fetching coupons list:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== DROPDOWN CONTINENTS ====================
exports.dropdownContinents = async (req, res) => {
  try {
    // ✅ Pagination params
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // ✅ Fetch total count
    const [totalResult] = await db.execute(
      "SELECT COUNT(*) AS total FROM continents"
    );
    const total = totalResult[0].total;

    // ✅ Fetch paginated rows
    const [rows] = await db.query(
      "SELECT continentId, continentName FROM continents LIMIT ? OFFSET ?",
      [perPage, offset]
    );

    // ✅ Map results
    const continentsArray = rows.map((value) => ({
      continentId: value.continentId,
      continentName: value.continentName,
    }));

    const lastPage = Math.ceil(total / perPage);
    const nextPageUrl =
      page < lastPage
        ? `/api/dropdown-continents?page=${page + 1}&perPage=${perPage}`
        : null;
    const previousPageUrl =
      page > 1
        ? `/api/dropdown-continents?page=${page - 1}&perPage=${perPage}`
        : null;

    return res.status(200).json({
      data: continentsArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl,
      previousPageUrl,
      lastPage,
    });
  } catch (err) {
    console.error("Error fetching continents:", err);
    return res.status(500).json({ message: err.message });
  }
};
// ==================== ALL COUNTRY LIST ====================
// ✅ allCountryList
// ✅ allCountryList
exports.allCountryList = async (req, res) => {
  try {
    // 🔑 Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      59,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // 🔢 Pagination params (force integers, with defaults)
    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const perPage =
      parseInt(req.query.perPage) > 0 ? parseInt(req.query.perPage) : 10;
    const offset = (page - 1) * perPage;

    console.log("Pagination:", { page, perPage, offset });

    // 📊 Get total count first
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total 
       FROM countries 
       JOIN continents ON countries.continentId = continents.continentId`
    );
    const total = countRows[0].total;

    // 📥 Fetch paginated data (⚡ FIXED LIMIT/OFFSET order)
    const [rows] = await pool.execute(
      `SELECT 
      countries.countryId,
      countries.continentId,
      countries.countryName,
      countries.image,
      countries.description,
      continents.continentName
   FROM countries
   JOIN continents ON countries.continentId = continents.continentId
   ORDER BY countries.created_at DESC
   LIMIT ${offset}, ${perPage}`
    );

    // 📦 Prepare response array
    const countriesArray = rows.map((value) => ({
      countryId: value.countryId,
      continentId: value.continentId,
      countryName: value.countryName,
      continentName: value.continentName,
      image: value.image,
      description: value.description,
    }));

    // 📤 Send response
    res.status(200).json({
      data: countriesArray,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl:
        page * perPage < total
          ? `/api/all-country-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/all-country-list?page=${page - 1}&perPage=${perPage}`
          : null,
    });
  } catch (err) {
    console.error("Error fetching country list:", err);
    res
      .status(500)
      .json({ message: "Error fetching country list", error: err.message });
  }
};

exports.allStateList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await require("../CommonController").checkToken(
      req.headers["token"],
      [59]
    );
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Pagination params (defaults to page=1, perPage=10)
    let { page = 1, perPage = 10 } = req.query;
    page = parseInt(page);
    perPage = parseInt(perPage);
    const offset = (page - 1) * perPage;

    // ✅ Fetch paginated states with joins
    const [rows] = await pool.execute(
      `SELECT 
          states.stateId,
          states.stateName,
          states.image,
          states.description,
          countries.countryName,
          continents.continentName
       FROM states
       JOIN countries ON states.countryId = countries.countryId
       JOIN continents ON states.continentId = continents.continentId
       ORDER BY states.created_at DESC
       LIMIT ${offset}, ${perPage}`
    );

    // ✅ Total count
    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM states`
    );
    const total = totalRows[0].total;

    // ✅ Map to match Laravel's $stateArray
    const stateArray = rows.map((value) => ({
      stateId: value.stateId,
      stateName: value.stateName,
      countryName: value.countryName,
      continentName: value.continentName,
      image: value.image || "",
      description: value.description || "",
    }));

    // ✅ Response
    res.status(200).json({
      data: stateArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/api/all-state-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/all-state-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching state list:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.allCityList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await require("../CommonController").checkToken(
      req.headers["token"],
      [59]
    );
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Pagination params (defaults to page=1, perPage=10)
    let { page = 1, perPage = 10 } = req.query;
    page = parseInt(page);
    perPage = parseInt(perPage);
    const offset = (page - 1) * perPage;

    // ✅ Fetch paginated cities with joins
    const [rows] = await pool.execute(
      `SELECT 
          cities.citiesId,
          cities.citiesName,
          cities.image,
          cities.description,
          states.stateName,
          countries.countryName,
          continents.continentName
       FROM cities
       JOIN countries ON cities.countryId = countries.countryId
       JOIN continents ON cities.continentId = continents.continentId
       LEFT JOIN states ON cities.stateId = states.stateId
       ORDER BY cities.created_at DESC
       LIMIT ${offset}, ${perPage}`
    );

    // ✅ Total count
    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM cities`
    );
    const total = totalRows[0].total;

    // ✅ Map to match Laravel's $stateArray
    const cityArray = rows.map((value) => ({
      citiesId: value.citiesId,
      citiesName: value.citiesName,
      stateName: value.stateName,
      countryName: value.countryName,
      continentName: value.continentName,
      image: value.image || "",
      description: value.description || "",
    }));

    // ✅ Response
    res.status(200).json({
      data: cityArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/api/all-city-list?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/all-city-list?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching city list:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
// controllers/sectorController.js
exports.addSector = async (req, res) => {
  let connection;
  try {
    const { sectorName } = req.body;

    // ✅ Validation
    if (!sectorName) {
      return res.status(400).json({ message: "Sector name is required" });
    }

    connection = await pool.getConnection();

    // ✅ Check if sector already exists for this client
    const clientcode = "C001"; // default clientcode
    const [existing] = await connection.query(
      "SELECT * FROM sectors WHERE sectorName = ? AND clientcode = ?",
      [sectorName, clientcode]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Sector already exists" });
    }

    // ✅ Insert new sector
    await connection.query(
      `INSERT INTO sectors (sectorName, clientcode, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [sectorName, clientcode]
    );

    return res.status(200).json({ message: "Sector added successfully" });
  } catch (err) {
    console.error("Error in addSector:", err);
    return res
      .status(500)
      .json({ message: "An error occurred", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};
// controllers/sectorController.js
// controllers/sectorController.js
exports.deleteSector = async (req, res) => {
  let connection;
  try {
    // Get sectorId from query or body
    const sectorId = req.query.sectorId || req.body.sectorId;

    // Validate sectorId
    if (!sectorId || isNaN(sectorId)) {
      return res.status(400).json({ message: "Valid sectorId is required" });
    }

    connection = await pool.getConnection();

    // Check if sector exists
    const [existing] = await connection.query(
      "SELECT * FROM sectors WHERE sectorId = ?",
      [sectorId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: "Sector not found" });
    }

    // Delete sector
    await connection.query("DELETE FROM sectors WHERE sectorId = ?", [
      sectorId,
    ]);

    return res.status(200).json({ message: "Sector deleted successfully" });
  } catch (err) {
    console.error("Error in deleteSector:", err);
    return res
      .status(500)
      .json({ message: "An error occurred", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

// controllers/cityController.js
exports.deleteCity = async (req, res) => {
  let connection;
  try {
    const citiesId = req.query.citiesId || req.body.citiesId;

    // ✅ Validation
    if (!citiesId) {
      return res.status(400).json({ message: "citiesId is required" });
    }

    connection = await pool.getConnection();

    // ✅ Token check (uncomment if needed)
    // const tokenData = await CommonController.checkToken(req.headers["token"], [62]);
    // if (tokenData.error) {
    //   return res.status(401).json(tokenData);
    // }

    // Check if city exists
    const [check] = await connection.query(
      "SELECT * FROM cities WHERE citiesId = ?",
      [citiesId]
    );
    if (check.length === 0) {
      return res.status(404).json({ message: "city not found" });
    }

    // Delete city
    const [deleteResult] = await connection.query(
      "DELETE FROM cities WHERE citiesId = ?",
      [citiesId]
    );

    if (deleteResult.affectedRows > 0) {
      return res.status(200).json({ message: "city deleted successfully" });
    } else {
      return res.status(500).json({ message: "Something went wrong" });
    }
  } catch (err) {
    console.error("Error in deleteCity:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

// controllers/stateController.js
exports.editState = async (req, res) => {
  let connection;
  try {
    const { stateId, stateName, image, description } = req.body;

    // ✅ Validation
    if (!stateId) {
      return res.status(400).json({ message: "stateId is required" });
    }

    connection = await pool.getConnection();

    // ✅ Token check (uncomment if needed)
    // const tokenData = await CommonController.checkToken(req.headers["token"], [61]);
    // if (tokenData.error) {
    //   return res.status(401).json(tokenData);
    // }

    // Check if state exists
    const [state] = await connection.query(
      "SELECT * FROM states WHERE stateId = ?",
      [stateId]
    );

    if (!state || state.length === 0) {
      return res.status(404).json({ message: "state not found" });
    }

    // Update state
    const [updateResult] = await connection.query(
      "UPDATE states SET stateName = ?, image = ?, description = ? WHERE stateId = ?",
      [stateName, image, description, stateId]
    );

    if (updateResult.affectedRows > 0) {
      return res.status(200).json({ message: "state updated successfully" });
    } else {
      return res.status(400).json({ message: "Something went wrong" });
    }
  } catch (err) {
    console.error("Error in editState:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

// controllers/countryController.js
exports.editCountry = async (req, res) => {
  let connection;
  try {
    const { countryId, countryName, image, description } = req.body;

    // ✅ Validation
    if (!countryId) {
      return res.status(400).json({ message: "countryId is required" });
    }

    connection = await pool.getConnection();

    // ✅ Token check (uncomment if needed)
    // const tokenData = await CommonController.checkToken(req.headers["token"], [61]);
    // if (tokenData.error) {
    //   return res.status(401).json(tokenData);
    // }

    // Check if country exists
    const [country] = await connection.query(
      "SELECT * FROM countries WHERE countryId = ?",
      [countryId]
    );

    if (!country || country.length === 0) {
      return res.status(404).json({ message: "country not found" });
    }

    // Update country
    const [updateResult] = await connection.query(
      "UPDATE countries SET countryName = ?, image = ?, description = ? WHERE countryId = ?",
      [countryName, image, description, countryId]
    );

    if (updateResult.affectedRows > 0) {
      return res.status(200).json({ message: "country updated successfully" });
    } else {
      return res.status(400).json({ message: "Please update the value" });
    }
  } catch (err) {
    console.error("Error in editCountry:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

// controllers/countryController.js
exports.deleteCountry = async (req, res) => {
  let connection;
  try {
    const countryId = req.query.countryId || req.body.countryId;

    // Validation
    if (!countryId) {
      return res.status(400).json({ message: "countryId is required" });
    }

    connection = await pool.getConnection();

    // ✅ Check token (uncomment if needed)
    // const tokenData = await CommonController.checkToken(req.headers["token"], [62]);
    // if (tokenData.error) {
    //   return res.status(401).json(tokenData);
    // }

    // Check if country exists
    const [check] = await connection.query(
      "SELECT * FROM countries WHERE countryId = ?",
      [countryId]
    );
    if (check.length === 0) {
      return res.status(404).json({ message: "country not found" });
    }

    // Check if any city uses this country
    const [checkCity] = await connection.query(
      "SELECT * FROM cities WHERE countryId = ?",
      [countryId]
    );
    if (checkCity.length > 0) {
      return res
        .status(400)
        .json({ message: "country stored in city so can't delete it" });
    }

    // Check if any state uses this country
    const [checkState] = await connection.query(
      "SELECT * FROM states WHERE countryId = ?",
      [countryId]
    );
    if (checkState.length > 0) {
      return res
        .status(400)
        .json({ message: "country stored in states so can't delete it" });
    }

    // Delete country
    const [deleteResult] = await connection.query(
      "DELETE FROM countries WHERE countryId = ?",
      [countryId]
    );

    if (deleteResult.affectedRows > 0) {
      return res.status(200).json({ message: "country deleted successfully" });
    } else {
      return res.status(500).json({ message: "Something went wrong" });
    }
  } catch (err) {
    console.error("Error in deleteCountry:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};
// controllers/sectorController.js
exports.updateSector = async (req, res) => {
  try {
    const { sectorId, sectorName } = req.body;

    if (!sectorId || !sectorName) {
      return res
        .status(400)
        .json({ message: "sectorId and sectorName required" });
    }

    const clientcode = "C001"; // default like your other tables

    const [result] = await pool.query(
      `UPDATE sectors SET sectorName = ? WHERE sectorId = ? AND clientcode = ?`,
      [sectorName, sectorId, clientcode]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Sector not found or nothing to update" });
    }

    res.status(200).json({ message: "Sector updated successfully" });
  } catch (err) {
    console.error("Error updating sector:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// controllers/cityController.js
exports.editCity = async (req, res) => {
  let connection;
  try {
    const { citiesId, citiesName, image, description } = req.body;

    // ✅ Validation
    if (!citiesId) {
      return res.status(400).json({ message: "citiesId is required" });
    }

    connection = await pool.getConnection();

    // ✅ Token check (uncomment if needed)
    // const tokenData = await CommonController.checkToken(req.headers["token"], [61]);
    // if (tokenData.error) {
    //   return res.status(401).json(tokenData);
    // }

    // Check if city exists
    const [city] = await connection.query(
      "SELECT * FROM cities WHERE citiesId = ?",
      [citiesId]
    );

    if (!city || city.length === 0) {
      return res.status(404).json({ message: "City not found" });
    }

    // Update city
    const [updateResult] = await connection.query(
      "UPDATE cities SET citiesName = ?, image = ?, description = ? WHERE citiesId = ?",
      [citiesName, image, description, citiesId]
    );

    if (updateResult.affectedRows > 0) {
      return res.status(200).json({ message: "city updated successfully" });
    } else {
      return res.status(400).json({ message: "Something went wrong" });
    }
  } catch (err) {
    console.error("Error in editCity:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

exports.sectorsList = async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      79,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Default clientcode (from token OR fallback to C001)
    const clientcode = tokenData.clientcode || "C001";

    // ✅ Pagination setup
    let { page = 1, perPage = 10 } = req.query;
    page = parseInt(page);
    perPage = parseInt(perPage);
    const offset = (page - 1) * perPage;

    // ✅ Fetch paginated sectors
    const [rows] = await db.query(
      `SELECT sectorId, sectorName, clientcode, created_at, updated_at
       FROM sectors
       WHERE clientcode = ?
       ORDER BY created_at DESC
       LIMIT ?, ?`,
      [clientcode, offset, perPage]
    );

    // ✅ Total count
    const [totalRows] = await db.query(
      `SELECT COUNT(*) AS total FROM sectors WHERE clientcode = ?`,
      [clientcode]
    );
    const total = totalRows[0].total;

    // ✅ Response
    return res.status(200).json({
      success: true,
      data: rows,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error in sectorList:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteState = async (req, res) => {
  try {
    // ✅ Validate stateId
    const stateId = parseInt(req.query.stateId);
    if (!stateId) {
      return res.status(400).json({ message: ["stateId is required"] });
    }

    // ✅ Check token
    const tokenData = await require("../CommonController").checkToken(
      req.headers["token"],
      [62]
    );
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Check if state exists
    const [stateRows] = await pool.execute(
      `SELECT * FROM states WHERE stateId = ? LIMIT 1`,
      [stateId]
    );
    if (stateRows.length === 0) {
      return res.status(404).json({ message: "state not found" });
    }

    // ✅ Check if any city is linked to this state
    const [cityRows] = await pool.execute(
      `SELECT * FROM cities WHERE stateId = ? LIMIT 1`,
      [stateId]
    );
    if (cityRows.length > 0) {
      return res
        .status(404)
        .json({ message: "state stored in city so cant delete it" });
    }

    // ✅ Delete the state
    const [deleteResult] = await pool.execute(
      `DELETE FROM states WHERE stateId = ?`,
      [stateId]
    );

    if (deleteResult.affectedRows > 0) {
      return res.status(200).json({ message: "state deleted successfully" });
    } else {
      return res.status(500).json({ message: "Something went wrong" });
    }
  } catch (err) {
    console.error("Error deleting state:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.salesListing = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await require("../CommonController").checkToken(
      req.headers["token"],
      [90, 115]
    );
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Pagination params
    let { page = 1, perPage = 10, guestName, email } = req.query;
    page = parseInt(page);
    perPage = parseInt(perPage);
    const offset = (page - 1) * perPage;

    // ✅ Build WHERE conditions
    let whereClauses = [`roleId NOT IN (0, 1)`];
    let params = [];

    if (guestName && guestName.trim() !== "") {
      whereClauses.push(`userName LIKE ?`);
      params.push(`%${guestName}%`);
    }

    if (email && email.trim() !== "") {
      whereClauses.push(`email LIKE ?`);
      params.push(`%${email}%`);
    }

    const whereSQL = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // ✅ Total count
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users ${whereSQL}`,
      params
    );
    const total = countRows[0].total;

    // ✅ Fetch paginated sales (removed businesses join)
    const [rows] = await pool.execute(
      `SELECT 
          userId,
          userName,
          email,
          contact,
          adharCard,
          address,
          status
       FROM users
       ${whereSQL}
       ORDER BY created_at DESC
       LIMIT ${offset}, ${perPage}`,
      params
    );

    // ✅ Map to match Laravel's $salesArray
    const salesArray = rows.map((value) => ({
      userId: value.userId,
      userName: value.userName,
      email: value.email,
      contact: value.contact,
      businessName: value.businessName || "", // Will be empty if not in table
      adharCard: value.adharCard,
      address: value.address,
      status: value.status,
      statusDescription: "1-active,0-deactive",
    }));

    // ✅ Response
    res.status(200).json({
      data: salesArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/api/sales-listing?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/sales-listing?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching sales listing:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.salesTarget = async (req, res) => {
  try {
    const { userId, yearId, tourType, targetArray } = req.body;

    // ✅ Validate main fields
    if (userId === undefined || yearId === undefined || !tourType) {
      return res.status(400).json({
        message: ["userId, yearId, and tourType are required"],
      });
    }

    // ✅ Validate targetArray
    if (!Array.isArray(targetArray) || targetArray.length === 0) {
      return res.status(400).json({
        message: ["targetArray is required and must be a non-empty array"],
      });
    }

    // ✅ Allow 0 as valid monthId/target
    for (let i = 0; i < targetArray.length; i++) {
      const t = targetArray[i];
      if (
        t.monthId === undefined ||
        t.monthId === null ||
        t.target === undefined ||
        t.target === null
      ) {
        return res.status(400).json({
          message: [
            `targetArray[${i}].monthId and targetArray[${i}].target are required`,
          ],
        });
      }
    }

    // ✅ Token check
    const tokenData = await require("../CommonController").checkToken(
      req.headers["token"],
      [1]
    );
    if (tokenData.error) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    // ✅ Get clientcode from token or DB
    let clientcode = tokenData.clientcode;
    if (!clientcode) {
      const [userRows] = await pool.execute(
        `SELECT clientcode FROM users WHERE userId = ? LIMIT 1`,
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      clientcode = userRows[0].clientcode;
    }

    // ✅ Delete existing targets for this user/year/tourType/clientcode
    await pool.execute(
      `DELETE FROM salestarget 
       WHERE userId = ? AND yearId = ? AND tourType = ? AND clientcode = ?`,
      [userId, yearId, tourType, clientcode]
    );

    // ✅ Prepare insert data
    const insertData = targetArray.map((t) => [
      userId,
      yearId,
      t.monthId,
      t.target,
      tourType,
      clientcode,
    ]);

    // ✅ Insert new targets
    const [result] = await pool.query(
      `INSERT INTO salestarget (userId, yearId, monthId, target, tourType, clientcode) VALUES ?`,
      [insertData]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Target not added" });
    }

    return res.status(200).json({ message: "Target added successfully" });
  } catch (err) {
    console.error("Error adding sales target:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.viewSalesTarget = async (req, res) => {
  try {
    const { userId, yearId } = req.query;

    // ✅ Validation
    if (userId === undefined || yearId === undefined) {
      return res.status(400).json({
        message: ["userId and yearId are required"],
      });
    }

    // ✅ Fetch salesDataGt (tourType = 1)
    const [salesDataGt] = await pool.execute(
      `SELECT * FROM salestarget 
       WHERE userId = ? AND yearId = ? AND tourType = 1`,
      [userId, yearId]
    );

    // ✅ Fetch salesDataCt (tourType = 2)
    const [salesDataCt] = await pool.execute(
      `SELECT * FROM salestarget 
       WHERE userId = ? AND yearId = ? AND tourType = 2`,
      [userId, yearId]
    );

    // ✅ Response
    res.status(200).json({
      salesDataGt: salesDataGt || [],
      salesDataCt: salesDataCt || [],
    });
  } catch (err) {
    console.error("Error fetching sales target:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.listRoles = async (req, res) => {
  try {
    // ✅ Token check
    const tokenData = await require("../CommonController").checkToken(
      req.headers["token"],
      [125]
    );
    if (tokenData.error) {
      return res.status(408).json({ message: "Invalid Token" });
    }

    // ✅ Pagination params
    let { page = 1, perPage = 10, roleName } = req.query;
    page = parseInt(page);
    perPage = parseInt(perPage);
    const offset = (page - 1) * perPage;

    // ✅ Build WHERE conditions
    let whereClauses = [`roleId != 1`];
    let params = [];

    if (roleName && roleName.trim() !== "") {
      whereClauses.push(`roleName LIKE ?`);
      params.push(`%${roleName}%`);
    }

    const whereSQL = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // ✅ Get total count
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM roles ${whereSQL}`,
      params
    );
    const total = countRows[0].total;

    // ✅ Fetch paginated roles
    const [rows] = await pool.execute(
      `SELECT roleId, roleName, DATE(created_at) AS created_at
       FROM roles
       ${whereSQL}
       ORDER BY created_at DESC
       LIMIT ${offset}, ${perPage}`,
      params
    );

    // ✅ Map to match Laravel's $roles_array
    const roles_array = rows.map((value) => ({
      roleId: value.roleId,
      roleName: value.roleName,
      created_at: value.created_at,
    }));

    // ✅ Response
    res.status(200).json({
      data: roles_array,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/api/list-roles?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1 ? `/api/list-roles?page=${page - 1}&perPage=${perPage}` : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching roles list:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.getCategories = async (req, res) => {
  try {
    const [cats] = await pool.execute(`SELECT * FROM categories`);
    res.status(200).json({ data: cats });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.getListsByCatId = async (req, res) => {
  try {
    const { catId } = req.query; // Using query params for GET

    // ✅ Validation
    if (!catId || isNaN(catId)) {
      return res
        .status(400)
        .json({ message: ["catId is required and must be numeric"] });
    }

    // ✅ Fetch lists
    const [lists] = await pool.execute(
      `SELECT catId, listId, listName 
       FROM lists 
       WHERE catId = ? 
       ORDER BY listName ASC`,
      [catId]
    );

    // ✅ Map to match Laravel's $lists_array
    const lists_array = lists.map((value) => ({
      catId: value.catId,
      listId: value.listId,
      listName: value.listName,
    }));

    res.status(200).json({ data: lists_array });
  } catch (err) {
    console.error("Error fetching lists by category:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Add Role

exports.addRoles = async (req, res) => {
  try {
    const normalize = (value) =>
      value === undefined ||
      value === null ||
      value === "undefined" ||
      value === "null"
        ? undefined
        : value;
    const { roleName, isActive } = req.body;
    if (!roleName || roleName.trim() === "") {
      return res.status(400).json({ message: "roleName is required" });
    }
    const token =
      normalize(req.headers["token"]) ||
      normalize(req.body?.token) ||
      normalize(req.query?.token) ||
      normalize(req.query?.headers?.token) ||
      normalize(req.query["headers[token]"]);
    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }
    const tokenData = await CommonController.checkToken(token, [125]);
    if (!tokenData || tokenData.status !== 200) {
      return res
        .status(tokenData?.status || 401)
        .json({ message: tokenData?.message || "Invalid or expired token" });
    }
    const tokenUser = tokenData.data || {};
    let userId =
      normalize(req.body.userId) ||
      normalize(req.query.userId) ||
      normalize(req.query?.params?.userId) ||
      tokenUser.userId;
    let clientcode = tokenUser.clientcode;
    if (!userId || !clientcode) {
      const [userRows] = await pool.execute(
        `SELECT userId, clientcode FROM users WHERE token = ? LIMIT 1`,
        [token]
      );
      if (!userRows || userRows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!userId) {
        userId = userRows[0].userId;
      }
      if (!clientcode) {
        clientcode = userRows[0].clientcode;
      }
    }
    if (!userId) {
      return res
        .status(400)
        .json({ message: "userId missing in token or request" });
    }
    if (!clientcode) {
      return res
        .status(400)
        .json({ message: "clientcode is required but missing" });
    }
    const [result] = await pool.execute(
      `INSERT INTO roles (roleName, isActive, clientcode, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [roleName.trim(), isActive ?? 1, clientcode]
    );
    if (result.affectedRows > 0) {
      return res.status(200).json({
        message: "Role added successfully",
        roleId: result.insertId,
      });
    }
    return res.status(500).json({ message: "Failed to add role" });
  } catch (err) {
    console.error("Error adding role:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.getRoleData = async (req, res) => {
  try {
    const { roleId } = req.query;

    // ✅ Validation
    if (!roleId) {
      return res.status(400).json({ message: ["roleId is required"] });
    }

    // ✅ Fetch role
    const [roleRows] = await pool.execute(
      `SELECT roleName, isActive FROM roles WHERE roleId = ? LIMIT 1`,
      [roleId]
    );

    if (roleRows.length === 0) {
      return res.status(404).json({ message: "Role not found" });
    }

    // ✅ Fetch permissions for this role
    const [permissions] = await pool.execute(
      `SELECT catId, listId FROM permissions WHERE roleId = ?`,
      [roleId]
    );

    // ✅ Group permissions by catId
    const groupedPermissions = {};
    permissions.forEach((p) => {
      if (!groupedPermissions[p.catId]) {
        groupedPermissions[p.catId] = { catId: p.catId, listIds: [] };
      }
      groupedPermissions[p.catId].listIds.push(p.listId);
    });

    // ✅ Build response object
    const data = {
      roleName: roleRows[0].roleName,
      isActive: roleRows[0].isActive,
      permissions: Object.values(groupedPermissions),
    };

    return res.status(200).json({ data });
  } catch (err) {
    console.error("Error fetching role data:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateRoleData = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { roleId, roleName, isActive, permissions } = req.body;

    if (!roleId) {
      return res.status(400).json({ message: "roleId is required" });
    }

    // ✅ Token check
    const tokenData = await CommonController.checkToken(
      req.headers["token"],
      [126] // permission ID for updating roles
    );

    if (tokenData.error) {
      return res.status(401).json({ message: "Invalid Token" });
    }

    let { clientcode, userId } = tokenData;

    // ✅ fallback if clientcode missing
    if (!clientcode) {
      if (!userId) {
        return res.status(400).json({ message: "userId missing in token" });
      }
      const [userRows] = await pool.execute(
        `SELECT clientcode FROM users WHERE userId = ? LIMIT 1`,
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      clientcode = userRows[0].clientcode;
    }

    if (!clientcode) {
      return res
        .status(400)
        .json({ message: "clientcode is required but missing" });
    }

    // ✅ Start transaction
    await connection.beginTransaction();

    // ✅ Update role
    await connection.execute(
      `UPDATE roles 
       SET roleName = ?, isActive = ?, clientcode = ?, updated_at = NOW() 
       WHERE roleId = ?`,
      [roleName, isActive, clientcode, roleId]
    );

    // ✅ Delete old permissions
    await connection.execute(`DELETE FROM permissions WHERE roleId = ?`, [
      roleId,
    ]);

    // ✅ Insert new permissions with clientcode
    if (Array.isArray(permissions)) {
      for (const value of permissions) {
        const { catId, listIds } = value;
        if (Array.isArray(listIds)) {
          for (const listId of listIds) {
            await connection.execute(
              `INSERT INTO permissions (roleId, catId, listId, clientcode, created_at, updated_at)
               VALUES (?, ?, ?, ?, NOW(), NOW())`,
              [roleId, catId, listId, clientcode]
            );
          }
        }
      }
    }

    await connection.commit();

    return res.status(200).json({
      message: "Roles data updated successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error updating role data:", err);
    return res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

// 📌 List Influencer & Affiliate
// ✅ list influencer affiliate

exports.listInfluencerAffiliate = async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      196,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const perPage = parseInt(req.query.perPage, 10) || 10;
    const page = parseInt(req.query.page, 10) || 1;
    const offset = (page - 1) * perPage;

    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM influencersaffiliates`
    );
    const total = countResult[0].total;

    const [rows] = await db.query(
      `SELECT id, firstName, lastName, role, email, phoneNo, fbLink, instagramLink, 
              twitterLink, otherLink, address, created_at
       FROM influencersaffiliates
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    const influencersAffiliateArray = rows.map((value) => ({
      id: value.id,
      firstName: value.firstName,
      lastName: value.lastName,
      role: value.role,
      roleDescription: "1-influencer, 2-affiliate",
      email: value.email,
      phoneNo: value.phoneNo,
      fbLink: value.fbLink,
      instagramLink: value.instagramLink,
      twitterLink: value.twitterLink,
      otherLink: value.otherLink,
      address: value.address,
    }));

    return res.status(200).json({
      data: influencersAffiliateArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page * perPage < total
          ? `/api/list-influencer-affiliate?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/api/list-influencer-affiliate?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error("Error fetching influencer affiliate list:", err);
    return res.status(400).json({ message: err.message });
  }
};

exports.viewInfluencerAffiliate = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id || isNaN(id)) {
      return res
        .status(400)
        .json({ errors: ["id is required and must be an integer"] });
    }

    const [rows] = await pool.execute(
      `SELECT ia.*, c.couponName, c.fromDate, c.toDate, c.status, c.discountType, c.discountValue, c.maxDiscount, c.isType
       FROM influencersaffiliates ia
       LEFT JOIN coupons c ON ia.couponId = c.couponId
       WHERE ia.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Influencer not found" });
    }

    const data = rows[0];
    const user_detail = {
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      roleDescription: "1-influencer,2-affiliate",
      email: data.email,
      phoneNo: data.phoneNo,
      fbLink: data.fbLink,
      instagramLink: data.instagramLink,
      twitterLink: data.twitterLink,
      otherLink: data.otherLink,
      address: data.address,
      commissionType: data.commissionType,
      commissionValue: data.commissionValue,
      maxCommission: data.maxCommission,
      accName: data.accName,
      accNo: data.accNo,
      bankName: data.bankName,
      branch: data.branch,
      cheque: data.cheque,
      ifsc: data.ifsc,
      couponId: data.couponId,
      couponName: data.couponName,
      fromDate: data.fromDate,
      toDate: data.toDate,
      status: data.status,
      discountType: data.discountType,
      discountValue: data.discountValue,
      maxDiscount: data.maxDiscount,
      isType: data.isType,
    };

    res.status(200).json({ data: user_detail });
  } catch (err) {
    console.error("Error viewing influencer/affiliate:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Update Influencer Affiliate
exports.updateInfoInfluencerAffiliate = async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      197,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    const { id, firstName, lastName, email, phoneNo, address } = req.body;

    if (!id || !firstName || !lastName || !email || !phoneNo || !address) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await db.query(
      `UPDATE influencersaffiliates SET firstName=?, lastName=?, email=?, phoneNo=?, 
              fbLink=?, instagramLink=?, twitterLink=?, otherLink=?, address=?, 
              accName=?, accNo=?, bankName=?, branch=?, cheque=?, ifsc=?
       WHERE id=?`,
      [
        firstName,
        lastName,
        email,
        phoneNo,
        req.body.fbLink,
        req.body.instagramLink,
        req.body.twitterLink,
        req.body.otherLink,
        address,
        req.body.accName,
        req.body.accNo,
        req.body.bankName,
        req.body.branch,
        req.body.cheque,
        req.body.ifsc,
        id,
      ]
    );

    return res.status(200).json({ message: "Account updated successfully" });
  } catch (err) {
    console.error("Error updating influencer:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// ✅ Get Commission Report

// ✅ Get Commission Report
// exports.getCommissionReport = async (req, res) => {
//   try {
//     const { page = 1, perPage = 10, year, month } = req.query;

//     // 🔐 Token + permission check
//     const tokenData = await CommonController.checkToken(req.headers["token"], [79]);
//    if (tokenData.error) {
//       return res.status(401).json(tokenData);
//     }

//     console.log("🔑 TokenData:", tokenData);
//     // 👇 Normalize userId
//     const salesId =
//       tokenData.data?.userId ||
//       tokenData.data?.id ||
//       tokenData.userId ||
//       tokenData.id ||
//       null;

//     if (!salesId) {
//       return res.status(401).json({ message: "Missing userId in token" });
//     }

//     // 🧠 Build query
//     let query = `
//       SELECT sc.*, u.firstName, u.lastName, egt.enquiryId
//       FROM salescommissions sc
//       JOIN users u ON sc.guestId = u.guestId
//       JOIN grouptours gt ON sc.groupTourId = gt.groupTourId
//       JOIN enquirygrouptours egt ON sc.enquiryId = egt.enquiryGroupId
//       WHERE sc.salesId = ?
//     `;
//     const params = [salesId];

//     if (month) {
//       query += ` AND MONTH(gt.startDate) = ?`;
//       params.push(month);
//     }
//     if (year) {
//       query += ` AND YEAR(gt.startDate) = ?`;
//       params.push(year);
//     }

//     query += ` ORDER BY sc.created_at DESC LIMIT ? OFFSET ?`;
//     params.push(Number(perPage), (Number(page) - 1) * Number(perPage));

//     const [rows] = await db.promise().execute(query, params);

//     // 📊 Build commission report array
//     const commissionDataArray = [];
//     for (const value of rows) {
//       const [commission] = await db
//         .promise()
//         .execute(
//           `SELECT tourPrice, offerPrice, commissionPrice
//            FROM grouptourpricediscount
//            WHERE roomShareId = ? AND groupTourId = ? LIMIT 1`,
//           [value.roomShareId, value.groupTourId]
//         );

//       if (commission.length > 0) {
//         commissionDataArray.push({
//           enquiryId: String(value.enquiryId).padStart(4, "0"),
//           bookingDate: new Date(value.created_at).toISOString().split("T")[0],
//           guestName: `${value.firstName} ${value.lastName}`,
//           inrCost: commission[0].tourPrice,
//           totalCost: commission[0].offerPrice,
//           commission: commission[0].commissionPrice,
//         });
//       }
//     }

//     // 📦 Response
//     const total = commissionDataArray.length;
//     const lastPage = Math.ceil(total / perPage);

//     return res.status(200).json({
//       data: commissionDataArray,
//       total,
//       currentPage: Number(page),
//       perPage: Number(perPage),
//       lastPage,
//       nextPageUrl:
//         page < lastPage
//           ? `/api/get-commission-report?page=${Number(page) + 1}&perPage=${perPage}`
//           : null,
//       previousPageUrl:
//         page > 1
//           ? `/api/get-commission-report?page=${Number(page) - 1}&perPage=${perPage}`
//           : null,
//     });
//   } catch (error) {
//     console.error("❌ Error fetching commission report:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };
exports.getCommissionReport = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      79,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Pagination setup
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Base WHERE clause
    let whereClause = "WHERE 1=1"; // no salesId filter
    let params = [];

    // Optional: filter by month/year
    if (req.query.month) {
      whereClause += " AND MONTH(gt.startDate) = ?";
      params.push(req.query.month);
    }
    if (req.query.year) {
      whereClause += " AND YEAR(gt.startDate) = ?";
      params.push(req.query.year);
    }

    // ✅ Count total records
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total
       FROM salescommissions sc
       JOIN users u ON sc.guestId = u.guestId
       JOIN grouptours gt ON sc.groupTourId = gt.groupTourId
       JOIN enquirygrouptours eg ON sc.enquiryId = eg.enquiryGroupId
       ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // ✅ Fetch paginated records
    const [rows] = await db.query(
      `SELECT sc.*, u.firstName, u.lastName, eg.enquiryId, gt.startDate
       FROM salescommissions sc
       JOIN users u ON sc.guestId = u.guestId
       JOIN grouptours gt ON sc.groupTourId = gt.groupTourId
       JOIN enquirygrouptours eg ON sc.enquiryId = eg.enquiryGroupId
       ${whereClause}
       ORDER BY sc.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    // ✅ Map data
    const commissionData = rows.map((value) => ({
      commissionId: value.commissionId,
      salesId: value.salesId,
      enquiryId: value.enquiryId,
      groupTourId: value.groupTourId,
      roomShareId: value.roomShareId,
      guestId: value.guestId,
      clientcode: value.clientcode,
      created_at: value.created_at,
      updated_at: value.updated_at,
      guestName: `${value.firstName} ${value.lastName}`,
      startDate: value.startDate,
    }));

    // ✅ Pagination info
    const lastPage = Math.ceil(total / perPage);

    return res.status(200).json({
      data: commissionData,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page < lastPage
          ? `/get-commission-report?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/get-commission-report?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage,
    });
  } catch (err) {
    console.error("Error in getCommissionReport:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.waariSelectReport = async (req, res) => {
  try {
    // ✅ Validate input
    if (!req.query.year) {
      return res.status(400).json({ message: ["year is required"] });
    }
    const year = parseInt(req.query.year);
    const nextYear = year + 1;

    const startDate = `${year}-04-01`;
    const endDate = `${nextYear}-03-31`;

    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      81,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ✅ Pagination
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    // ✅ Total count
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM users WHERE roleId = 0`
    );
    const total = countRows[0].total;

    // ✅ Fetch users + card info
    const [usersList] = await db.query(
      `
      SELECT users.userId, users.firstName, users.lastName, users.loyaltyPoints,
             users.guestId, cardtype.cardName
      FROM users
      JOIN cardtype ON users.cardId = cardtype.cardId
      WHERE users.roleId = 0
      ORDER BY users.userId DESC
      LIMIT ? OFFSET ?
      `,
      [perPage, offset]
    );

    const usersArray = [];

    // 🔹 Helper to safely sum with IN clause
    const safeSum = async (query, ids, params) => {
      if (!ids || ids.length === 0) return 0;
      const [rows] = await db.query(query, [...params, ids]);
      return rows[0]?.total || 0;
    };

    for (let value of usersList) {
      // ✅ Self bookings
      const [groupBooking] = await db.query(
        `SELECT enquiryGroupId FROM enquirygrouptours
         WHERE enquiryProcess = 2 AND guestId = ? AND created_at BETWEEN ? AND ?`,
        [value.guestId, startDate, endDate]
      );

      const [customBooking] = await db.query(
        `SELECT enquiryCustomId FROM customtourenquirydetails
         WHERE status = 1 AND guestId = ? AND created_at BETWEEN ? AND ?`,
        [value.guestId, startDate, endDate]
      );

      // ✅ Points
      const [points] = await db.query(
        `SELECT isType, description, loyaltyPoint FROM loyaltypoints
         WHERE userId = ? AND created_at BETWEEN ? AND ?`,
        [value.userId, startDate, endDate]
      );

      // ✅ Referrals
      const [referrals] = await db.query(
        `SELECT guestId FROM users
         WHERE referral = ? AND created_at BETWEEN ? AND ?`,
        [value.userId, startDate, endDate]
      );
      const referralGuestIds = referrals.map((r) => r.guestId);

      const [referralGroupBooking] = referralGuestIds.length
        ? await db.query(
            `SELECT enquiryGroupId FROM enquirygrouptours
             WHERE enquiryProcess = 2
             AND created_at BETWEEN ? AND ?
             AND guestId IN (?)`,
            [startDate, endDate, referralGuestIds]
          )
        : [[]];

      const [referralCustomBooking] = referralGuestIds.length
        ? await db.query(
            `SELECT enquiryCustomId FROM customtourenquirydetails
             WHERE status = 1
             AND created_at BETWEEN ? AND ?
             AND guestId IN (?)`,
            [startDate, endDate, referralGuestIds]
          )
        : [[]];

      // ✅ Sales & points calculations
      const groupIds = groupBooking.map((g) => g.enquiryGroupId);
      const customIds = customBooking.map((c) => c.enquiryCustomId);
      const refGroupIds = referralGroupBooking.map((r) => r.enquiryGroupId);
      const refCustomIds = referralCustomBooking.map((r) => r.enquiryCustomId);

      const selfTourSale =
        (await safeSum(
          `SELECT SUM(discountPrice) as total FROM grouptourdiscountdetails
           WHERE created_at BETWEEN ? AND ? AND enquiryGroupId IN (?)`,
          groupIds,
          [startDate, endDate]
        )) +
        (await safeSum(
          `SELECT SUM(discountPrice) as total FROM customtourdiscountdetails
           WHERE created_at BETWEEN ? AND ? AND enquiryCustomId IN (?)`,
          customIds,
          [startDate, endDate]
        ));

      const referredGuestSale =
        (await safeSum(
          `SELECT SUM(discountPrice) as total FROM grouptourdiscountdetails
           WHERE created_at BETWEEN ? AND ? AND enquiryGroupId IN (?)`,
          refGroupIds,
          [startDate, endDate]
        )) +
        (await safeSum(
          `SELECT SUM(discountPrice) as total FROM customtourdiscountdetails
           WHERE created_at BETWEEN ? AND ? AND enquiryCustomId IN (?)`,
          refCustomIds,
          [startDate, endDate]
        ));

      // ✅ Points breakdown
      const totalPointsEarned = points
        .filter((p) => p.isType === 0)
        .reduce((sum, p) => sum + p.loyaltyPoint, 0);

      const pointsEarnedTroughReferral = points
        .filter((p) => p.isType === 0 && p.description === "referral")
        .reduce((sum, p) => sum + p.loyaltyPoint, 0);

      const selfBookingPoints = points
        .filter((p) => p.isType === 0 && p.description === "self")
        .reduce((sum, p) => sum + p.loyaltyPoint, 0);

      const pointsReedem = points
        .filter((p) => p.isType === 1)
        .reduce((sum, p) => sum + p.loyaltyPoint, 0);

      // ✅ Final object
      usersArray.push({
        userId: value.userId,
        userName: `${value.firstName} ${value.lastName}`,
        cardName: value.cardName,
        referralId: value.guestId,
        loyaltyPoints: value.loyaltyPoints,
        selfBooking: groupBooking.length + customBooking.length,
        selfTourSale,
        totalPointsEarned,
        pointsEarnedTroughReferral,
        selfBookingPoints,
        referredGuest: referrals.length,
        referredGuestSale,
        pointsReedem,
      });
    }

    // ✅ Pagination response
    const lastPage = Math.ceil(total / perPage);

    return res.status(200).json({
      data: usersArray,
      total,
      currentPage: page,
      perPage,
      nextPageUrl:
        page < lastPage
          ? `/waari-select-report?page=${page + 1}&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/waari-select-report?page=${page - 1}&perPage=${perPage}`
          : null,
      lastPage,
    });
  } catch (err) {
    console.error("Error in waariSelectReport:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ==================== ASSIGNED CUSTOM TOUR LIST ====================
exports.assignedCustomTourList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      353,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let query = `
      SELECT e.*, d.destinationName 
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 1
      AND DATE(e.nextFollowUp) = CURDATE()
      AND TIME(e.nextFollowUpTime) > CURTIME()
      AND e.assignTo = ?
    `;
    let params = [tokenData.userId];

    // ✅ Filter: start + end date together
    if (req.query.startDate && req.query.endDate) {
      query += " AND e.startDate >= ? AND e.endDate <= ?";
      params.push(
        moment(req.query.startDate)
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss"),
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: only startDate
    if (req.query.startDate && !req.query.endDate) {
      query += " AND e.startDate >= ?";
      params.push(
        moment(req.query.startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: only endDate
    if (req.query.endDate && !req.query.startDate) {
      query += " AND e.endDate <= ?";
      params.push(
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: tourName
    if (req.query.tourName) {
      query += " AND e.groupName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Filter: search (firstName + lastName)
    if (req.query.search) {
      query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
      params.push(`%${req.query.search}%`);
    }

    query += " ORDER BY e.nextFollowUpTime ASC";

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as subq`,
      params
    );
    const total = countRows[0].total;

    // Paginated query
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // ✅ Transform Data
    const data = rows.map((value) => {
      return {
        enquiryCustomId: value.enquiryCustomId,
        uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
        enqDate: moment(value.created_at).format("DD-MM-YYYY"),
        groupName: value.groupName,
        contactName: `${value.firstName} ${value.lastName}`,
        startDate: moment(value.startDate).format("DD-MM-YYYY"),
        endDate: moment(value.endDate).format("DD-MM-YYYY"),
        contact: value.contact,
        destinationName: value.destinationName,
        pax: (value.adults || 0) + (value.child || 0),
        lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
        nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
        nextFollowUpTime: value.nextFollowUpTime,
        userName: tokenData.userName,
      };
    });

    res.json({
      data,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl:
        page < Math.ceil(total / perPage)
          ? `/assigned-custom-tour-list?page=${page + 1}`
          : null,
      previousPageUrl:
        page > 1 ? `/assigned-custom-tour-list?page=${page - 1}` : null,
    });
  } catch (err) {
    console.error("Error in assignedCustomTourList:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.assignedExpiredCustomTourList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      353,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let query = `
      SELECT e.*, d.destinationName 
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 1
      AND e.assignTo = ?
      AND (
        DATE(e.nextFollowUp) < CURDATE()
        OR (DATE(e.nextFollowUp) = CURDATE() AND TIME(e.nextFollowUpTime) < CURTIME())
      )
    `;
    let params = [tokenData.userId];

    // ✅ Filter: start + end date together
    if (req.query.startDate && req.query.endDate) {
      query += " AND e.startDate >= ? AND e.endDate <= ?";
      params.push(
        moment(req.query.startDate)
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss"),
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: only startDate
    if (req.query.startDate && !req.query.endDate) {
      query += " AND e.startDate >= ?";
      params.push(
        moment(req.query.startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: only endDate
    if (req.query.endDate && !req.query.startDate) {
      query += " AND e.endDate <= ?";
      params.push(
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: tourName
    if (req.query.tourName) {
      query += " AND e.groupName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Filter: search (firstName + lastName)
    if (req.query.search) {
      query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
      params.push(`%${req.query.search}%`);
    }

    query += " ORDER BY e.nextFollowUp DESC, e.nextFollowUpTime DESC";

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as subq`,
      params
    );
    const total = countRows[0].total;

    // Paginated query
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // ✅ Transform Data
    const data = rows.map((value) => {
      return {
        enquiryCustomId: value.enquiryCustomId,
        uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
        enqDate: moment(value.created_at).format("DD-MM-YYYY"),
        groupName: value.groupName,
        contactName: `${value.firstName} ${value.lastName}`,
        startDate: moment(value.startDate).format("DD-MM-YYYY"),
        endDate: moment(value.endDate).format("DD-MM-YYYY"),
        contact: value.contact,
        destinationName: value.destinationName,
        pax: (value.adults || 0) + (value.child || 0),
        lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
        nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
        nextFollowUpTime: value.nextFollowUpTime,
        userName: tokenData.userName,
      };
    });

    res.json({
      data,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl:
        page < Math.ceil(total / perPage)
          ? `/assigned-expired-custom-tour-list?page=${page + 1}`
          : null,
      previousPageUrl:
        page > 1 ? `/assigned-expired-custom-tour-list?page=${page - 1}` : null,
    });
  } catch (err) {
    console.error("Error in assignedExpiredCustomTourList:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.assignedUpcomingCustomTourList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      353,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const today = moment().format("YYYY-MM-DD");

    let query = `
      SELECT e.*, d.destinationName 
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 1
      AND e.nextFollowUp > ?
      AND e.assignTo = ?
    `;
    let params = [today, tokenData.userId];

    // ✅ Filter: start + end date
    if (req.query.startDate && req.query.endDate) {
      query += " AND e.startDate >= ? AND e.endDate <= ?";
      params.push(
        moment(req.query.startDate)
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss"),
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: only startDate
    if (req.query.startDate && !req.query.endDate) {
      query += " AND e.startDate >= ?";
      params.push(
        moment(req.query.startDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: only endDate
    if (req.query.endDate && !req.query.startDate) {
      query += " AND e.endDate <= ?";
      params.push(
        moment(req.query.endDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }

    // ✅ Filter: tourName
    if (req.query.tourName) {
      query += " AND e.groupName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    // ✅ Filter: search (firstName + lastName)
    if (req.query.search) {
      query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
      params.push(`%${req.query.search}%`);
    }

    query += " ORDER BY e.nextFollowUp ASC, e.nextFollowUpTime ASC";

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // Count total
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM (${query}) as subq`,
      params
    );
    const total = countRows[0].total;

    // Apply limit/offset
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    const [rows] = await db.query(query, params);

    // ✅ Transform Data
    const data = rows.map((value) => {
      return {
        enquiryCustomId: value.enquiryCustomId,
        uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
        enqDate: moment(value.created_at).format("DD-MM-YYYY"),
        groupName: value.groupName,
        contactName: `${value.firstName} ${value.lastName}`,
        startDate: moment(value.startDate).format("DD-MM-YYYY"),
        endDate: moment(value.endDate).format("DD-MM-YYYY"),
        contact: value.contact,
        destinationName: value.destinationName,
        pax: (value.adults || 0) + (value.child || 0),
        lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
        remark: value.remark,
        nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
        nextFollowUpTime: value.nextFollowUpTime,
        userName: tokenData.userName,
      };
    });

    res.json({
      data,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl:
        page < Math.ceil(total / perPage)
          ? `/assigned-upcoming-custom-tour-list?page=${page + 1}`
          : null,
      previousPageUrl:
        page > 1
          ? `/assigned-upcoming-custom-tour-list?page=${page - 1}`
          : null,
    });
  } catch (err) {
    console.error("Error in assignedUpcomingCustomTourList:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Assigned All Expired Custom Tour List
exports.assignedAllExpiredCustomTourList = async (req, res) => {
  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers.token, [
      358,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    const today = moment().format("YYYY-MM-DD");
    const nowTime = moment().format("HH:mm:ss");

    let {
      startDate,
      endDate,
      tourName,
      search,
      perPage = 10,
      page = 1,
    } = req.query;
    perPage = parseInt(perPage);
    page = parseInt(page);

    // ✅ Base query
    let sql = `
      SELECT enquirycustomtours.*, dropdowndestination.destinationName, users.userName
      FROM enquirycustomtours
      JOIN dropdowndestination ON enquirycustomtours.destinationId = dropdowndestination.destinationId
      JOIN users ON enquirycustomtours.assignTo = users.userId
      WHERE enquirycustomtours.enquiryProcess = 1
      AND enquirycustomtours.assignTo IS NOT NULL
      AND (
          enquirycustomtours.nextFollowUp < ?
          OR (enquirycustomtours.nextFollowUp = ? AND enquirycustomtours.nextFollowUpTime < ?)
      )
    `;

    const params = [today, today, nowTime];

    // ✅ Date filters
    if (startDate && endDate) {
      sql += " AND startDate >= ? AND endDate <= ?";
      params.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
      params.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }
    if (startDate && !endDate) {
      sql += " AND startDate >= ?";
      params.push(moment(startDate).startOf("day").format("YYYY-MM-DD"));
    }
    if (endDate && !startDate) {
      sql += " AND endDate <= ?";
      params.push(moment(endDate).endOf("day").format("YYYY-MM-DD"));
    }

    // ✅ Tour name filter
    if (tourName) {
      sql += " AND groupName LIKE ?";
      params.push(`%${tourName}%`);
    }

    // ✅ Search filter
    if (search) {
      sql +=
        " AND CONCAT(enquirycustomtours.firstName, ' ', enquirycustomtours.lastName) LIKE ?";
      params.push(`%${search}%`);
    }

    // ✅ Sorting
    sql +=
      " ORDER BY enquirycustomtours.nextFollowUp DESC, enquirycustomtours.nextFollowUpTime DESC";

    // ✅ Pagination
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as countTable`;
    const [countRows] = await db.query(countSql, params);
    const total = countRows.total;

    sql += " LIMIT ? OFFSET ?";
    params.push(perPage, (page - 1) * perPage);

    const [rows] = await db.query(sql, params);

    // ✅ Format response
    const data = rows.map((value) => ({
      enquiryCustomId: value.enquiryCustomId,
      uniqueEnqueryId: value.enquiryId.toString().padStart(4, "0"),
      enqDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      contactName: `${value.firstName} ${value.lastName}`,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      contact: value.contact,
      destinationName: value.destinationName,
      pax: value.adults + value.child,
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: value.userName,
    }));

    res.status(200).json({
      data,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
      nextPageUrl:
        page * perPage < total
          ? `/assigned-all-expired-custom-tour-list?page=${
              page + 1
            }&perPage=${perPage}`
          : null,
      previousPageUrl:
        page > 1
          ? `/assigned-all-expired-custom-tour-list?page=${
              page - 1
            }&perPage=${perPage}`
          : null,
    });
  } catch (error) {
    console.error("Error fetching expired tours:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
