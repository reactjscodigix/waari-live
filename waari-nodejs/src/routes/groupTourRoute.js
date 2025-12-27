const express = require("express");
const router = express.Router();
const db = require("../../db");
const pool = require("../../db");
const CommonController = require("../controllers/CommonController");
const moment = require("moment");
const { checkToken } = require("../controllers/CommonController");
const { query, validationResult } = require("express-validator");

// ---------------- VIEW GROUP TOUR ----------------
router.get("/view-group-tour", async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const perPage = parseInt(req.query.perPage?.trim() || "10");
    const page = parseInt(req.query.page?.trim() || "1");
    const offset = (page - 1) * perPage;

    const filters = {
      tourName: req.query.tourName?.trim() || "",
      tourType: req.query.tourType?.trim() || "",
      travelMonth: req.query.travelMonth?.trim() || "",
      totalDuration: req.query.totalDuration?.trim() || "",
      travelStartDate: req.query.travelStartDate?.trim() || "",
      travelEndDate: req.query.travelEndDate?.trim() || "",
      departureType: req.query.departureType?.trim() || "",
      cityId: req.query.cityId?.trim() || "",
    };

    let baseQuery = `
      SELECT g.*, t.tourTypeName, COALESCE(seats.bookedSeats, 0) AS bookedSeats
      FROM grouptours g
      LEFT JOIN tourtype t ON g.tourTypeId = t.tourTypeId
      LEFT JOIN (
        SELECT groupTourId, COUNT(*) AS bookedSeats
        FROM grouptourguestdetails
        WHERE isCancel = 0
        GROUP BY groupTourId
      ) AS seats ON seats.groupTourId = g.groupTourId
      WHERE g.groupTourProcess = 1
    `;
    const params = [];

    if (filters.tourName) {
      baseQuery += " AND g.tourName LIKE ?";
      params.push(`%${filters.tourName}%`);
    }

    if (filters.tourType) {
      baseQuery += " AND g.tourTypeId = ?";
      params.push(filters.tourType);
    }

    if (filters.travelStartDate && filters.travelEndDate) {
      baseQuery += " AND g.startDate >= ? AND g.endDate <= ?";
      params.push(filters.travelStartDate, filters.travelEndDate);
    } else if (filters.travelStartDate) {
      baseQuery += " AND g.startDate >= ?";
      params.push(filters.travelStartDate);
    } else if (filters.travelEndDate) {
      baseQuery += " AND g.endDate <= ?";
      params.push(filters.travelEndDate);
    }

    if (filters.totalDuration) {
      baseQuery += " AND CONCAT(g.days, 'D-', g.night, 'N') LIKE ?";
      params.push(`%${filters.totalDuration}%`);
    }

    if (filters.travelMonth) {
      const monthMoment = moment(filters.travelMonth, ["YYYY-MM", "YYYY-MM-DD"], true);
      if (monthMoment.isValid()) {
        baseQuery += " AND MONTH(g.startDate) = ?";
        params.push(monthMoment.format("MM"));
      }
    }

    if (filters.cityId) {
      baseQuery += ` AND EXISTS (
        SELECT 1 FROM grouptourscity gc
        WHERE gc.groupTourId = g.groupTourId AND gc.cityId = ?
      )`;
      params.push(filters.cityId);
    }

    if (filters.departureType) {
      baseQuery += " AND g.departureTypeId = ?";
      params.push(filters.departureType);
    }

    const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS totalRows`;
    const countParams = [...params];
    const [countRows] = await db.query(countQuery, countParams);
    const total = countRows[0]?.total || 0;

    const finalQuery = `${baseQuery} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`;
    const finalParams = [...params, perPage, offset];
    const [rows] = await db.query(finalQuery, finalParams);

    const host = `${req.protocol}://${req.get("host")}`;
    const buildUrl = (value) => {
      if (!value) {
        return "";
      }
      return /^https?:\/\//i.test(value) ? value : `${host}${value}`;
    };

    const data = rows.map((row) => {
      const seatsBook = Number(row.bookedSeats) || 0;
      const totalSeats = Number(row.totalSeats) || 0;
      const hasDurationValues = row.days != null && row.night != null;
      return {
        groupTourId: row.groupTourId,
        tourName: row.tourName,
        tourCode: row.tourCode,
        tourTypeName: row.tourTypeName,
        startDate: row.startDate ? moment(row.startDate).format("DD-MM-YYYY") : "",
        endDate: row.endDate ? moment(row.endDate).format("DD-MM-YYYY") : "",
        duration: hasDurationValues ? `${row.days}D-${row.night}N` : "",
        totalSeats,
        seatsBook,
        seatsAval: Math.max(totalSeats - seatsBook, 0),
        pdfUrl: buildUrl(row.pdfUrl),
        printUrl: buildUrl(row.printUrl),
        predepartureUrl: buildUrl(row.predepartureUrl),
        websiteBanner: row.websiteBanner,
        websiteDescription: row.websiteDescription,
      };
    });

    res.status(200).json({
      message: "Group tours fetched successfully",
      filters,
      total,
      perPage,
      page,
      currentPage: page,
      lastPage: Math.ceil(total / perPage),
      data,
    });
  } catch (error) {
    console.error("[/view-group-tour] Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------- TOUR TYPE LIST ----------------
router.get("/tour-type-list", async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    const [rows] = await db.query("SELECT * FROM tourtype");
    const tourTypeArray = rows.map((row) => ({
      tourTypeId: row.tourTypeId,
      tourTypeName: row.tourTypeName,
      tourTypeImage: row.tourTypeImage,
    }));

    res.status(200).json({
      message: "Tour types fetched successfully",
      filters: {
        perPage: req.query.perPage || "10",
        page: req.query.page || "1",
      },
      data: tourTypeArray,
    });
  } catch (error) {
    console.error("[/tour-type-list] Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------- CITY LIST ----------------
router.get("/city-list", async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let query = "SELECT citiesId, citiesName FROM cities";
    const params = [];
    const conditions = [];

    if (req.query.stateId) {
      conditions.push("stateId = ?");
      params.push(req.query.stateId);
    }
    if (req.query.countryId) {
      conditions.push("countryId = ?");
      params.push(req.query.countryId);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const [cityList] = await db.query(query, params);
    const cityArray = cityList.map((city) => ({
      citiesId: city.citiesId,
      citiesName: city.citiesName,
    }));

    res.status(200).json({
      message: "Cities fetched successfully",
      data: cityArray,
    });
  } catch (error) {
    console.error("[/city-list] Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------- DESTINATION LIST ----------------
router.get("/destination-list", async (req, res) => {
  try {
    // Optional: handle pagination from query params
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Query destinations
    const [rows] = await db.query(
      `SELECT destinationId, destinationName 
       FROM dropdowndestination 
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    // Map to desired structure
    const destination_array = rows.map((row) => ({
      destinationId: row.destinationId,
      destinationName: row.destinationName,
    }));

    return res.status(200).json({ data: destination_array });
  } catch (error) {
    console.error("[/destination-list] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------- VEHICLE LIST ----------------
router.get("/vehicle-listing", async (req, res) => {
  try {
    // Optional pagination
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Query vehicle list
    const [rows] = await db.query(
      `SELECT vehicleId, vehicleName 
       FROM dropdownvehicle 
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    // Map data
    const vehiclelist_array = rows.map((row) => ({
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleName,
    }));

    return res.status(200).json({ data: vehiclelist_array });
  } catch (error) {
    console.error("[/vehicle-list] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/meal-plan-list", async (req, res) => {
  try {
    // Optional pagination
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Query meal plan list
    const [rows] = await db.query(
      `SELECT mealPlanId, mealPlanName 
       FROM dropdownmealplan 
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    // Map data
    const mealPlan_array = rows.map((row) => ({
      mealPlanId: row.mealPlanId,
      mealPlanName: row.mealPlanName,
    }));

    return res.status(200).json({ data: mealPlan_array });
  } catch (error) {
    console.error("[/meal-plan-list] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------- MEAL TYPE LIST ----------------
router.get("/meal-type-list", async (req, res) => {
  try {
    // Optional pagination
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Query meal type list
    const [rows] = await db.query(
      `SELECT mealTypeId, mealTypeName 
       FROM dropdownmealtype 
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    // Map data
    const mealType_array = rows.map((row) => ({
      mealTypeId: row.mealTypeId,
      mealTypeName: row.mealTypeName,
    }));

    return res.status(200).json({ data: mealType_array });
  } catch (error) {
    console.error("[/meal-type-list] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/kitchen-list", async (req, res) => {
  try {
    // Optional pagination
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Query kitchen list
    const [rows] = await db.query(
      `SELECT kitchenId, kitchenName 
       FROM dropdownkitchen 
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    // Map data
    const kitchenList_array = rows.map((row) => ({
      kitchenId: row.kitchenId,
      kitchenName: row.kitchenName,
    }));

    return res.status(200).json({ data: kitchenList_array });
  } catch (error) {
    console.error("[/kitchen-list] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------- VIEW DRAFT GROUP TOUR ----------------
// router.get("/view-draft-group-tour", async (req, res) => {
//   try {
//     // ✅ Token validation
//     const tokenData = await CommonController.checkToken(req.headers["token"], [74]);
//     if (tokenData.error) {
//       return res.status(401).json(tokenData);
//     }

//     let query = `
//       SELECT g.*, t.tourTypeName
//       FROM grouptours g
//       JOIN tourtype t ON g.tourTypeId = t.tourTypeId
//       WHERE g.groupTourProcess = 0
//     `;
//     const params = [];

//     // ---------------- Filters ----------------
//     if (req.query.travelStartDate && req.query.travelEndDate) {
//       query += ` AND g.startDate >= ? AND g.endDate <= ?`;
//       params.push(req.query.travelStartDate, req.query.travelEndDate);
//     } else if (req.query.travelStartDate) {
//       query += ` AND g.startDate >= ?`;
//       params.push(req.query.travelStartDate);
//     } else if (req.query.travelEndDate) {
//       query += ` AND g.endDate <= ?`;
//       params.push(req.query.travelEndDate);
//     }

//     if (req.query.tourName) {
//       query += ` AND g.tourName LIKE ?`;
//       params.push(`%${req.query.tourName}%`);
//     }

//     if (req.query.totalDuration) {
//       query += ` AND CONCAT(g.days,'D-', g.night,'N') LIKE ?`;
//       params.push(`%${req.query.totalDuration}%`);
//     }

//     if (req.query.tourType) {
//       query += ` AND t.tourTypeId LIKE ?`;
//       params.push(`%${req.query.tourType}%`);
//     }

//     if (req.query.travelMonth) {
//       const month = moment(req.query.travelMonth, "YYYY-MM-DD").format("MM");
//       query += ` AND MONTH(g.startDate) = ?`;
//       params.push(month);
//     }

//     // Joins for city and departureType filters
//     if (req.query.cityId) {
//       query += `
//         AND g.groupTourId IN (
//           SELECT groupTourId FROM grouptourscity WHERE cityId = ?
//         )
//       `;
//       params.push(req.query.cityId);
//     }

//     if (req.query.departureTypeId) {
//       query += `
//         AND g.departureTypeId IN (
//           SELECT departureTypeId FROM dropdowndeparturetype WHERE departureTypeId = ?
//         )
//       `;
//       params.push(req.query.departureTypeId);
//     }

//     query += ` ORDER BY g.created_at DESC`;

//     // ---------------- Pagination ----------------
//     const perPage = parseInt(req.query.perPage) || 10;
//     const page = parseInt(req.query.page) || 1;
//     const offset = (page - 1) * perPage;
//     query += ` LIMIT ? OFFSET ?`;
//     params.push(perPage, offset);

//     // Execute query
//     const [groupTours] = await db.query(query, params);

//     // Count total rows (for pagination)
//     const [countResult] = await db.query(
//       `SELECT COUNT(*) as total FROM grouptours g JOIN tourtype t ON g.tourTypeId = t.tourTypeId WHERE g.groupTourProcess = 0`
//     );
//     const total = countResult[0].total;

//     // Map results
//     const groupTours_array = await Promise.all(
//       groupTours.map(async (g) => {
//         const bookedSeatsResult = await db.query(
//           `SELECT COUNT(*) as bookedSeats FROM grouptourguestdetails WHERE groupTourId = ? AND isCancel = 0`,
//           [g.groupTourId]
//         );
//         const bookedSeats = bookedSeatsResult[0][0].bookedSeats || 0;

//         return {
//           groupTourId: g.groupTourId,
//           tourName: g.tourName,
//           tourCode: g.tourCode,
//           tourTypeName: g.tourTypeName,
//           startDate: moment(g.startDate).format("DD-MM-YYYY"),
//           endDate: moment(g.endDate).format("DD-MM-YYYY"),
//           duration: `${g.days}D-${g.night}N`,
//           totalSeats: g.totalSeats,
//           seatsBook: bookedSeats,
//           seatsAval: g.totalSeats - bookedSeats,
//           pdfUrl: g.pdfUrl ? `${req.protocol}://${req.get("host")}${g.pdfUrl}` : "",
//           printUrl: g.printUrl ? `${req.protocol}://${req.get("host")}${g.printUrl}` : "",
//           predepartureUrl: g.predepartureUrl ? `${req.protocol}://${req.get("host")}${g.predepartureUrl}` : "",
//           websiteBanner: g.websiteBanner,
//           websiteDescription: g.websiteDescription,
//         };
//       })
//     );

//     return res.status(200).json({
//       data: groupTours_array,
//       total,
//       currentPage: page,
//       perPage,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("[/view-drafts-group-tour] Error:", error.message);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// });

// ---------------- VIEW DRAFT GROUP TOUR ----------------
router.get("/view-draft-group-tour", async (req, res) => {
  try {
    // ✅ Token validation
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      74,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    // ---------------- Base query ----------------
    let query = `
      SELECT g.*, t.tourTypeName
      FROM grouptours g
      JOIN tourtype t ON g.tourTypeId = t.tourTypeId
      WHERE g.groupTourProcess = 0
    `;
    const params = [];

    // ---------------- Filters ----------------
    if (req.query.travelStartDate && req.query.travelEndDate) {
      query += ` AND g.startDate >= ? AND g.endDate <= ?`;
      params.push(req.query.travelStartDate, req.query.travelEndDate);
    } else if (req.query.travelStartDate) {
      query += ` AND g.startDate >= ?`;
      params.push(req.query.travelStartDate);
    } else if (req.query.travelEndDate) {
      query += ` AND g.endDate <= ?`;
      params.push(req.query.travelEndDate);
    }

    if (req.query.tourName) {
      query += ` AND g.tourName LIKE ?`;
      params.push(`%${req.query.tourName}%`);
    }

    if (req.query.totalDuration) {
      query += ` AND CONCAT(g.days,'D-', g.night,'N') LIKE ?`;
      params.push(`%${req.query.totalDuration}%`);
    }

    if (req.query.tourType) {
      query += ` AND t.tourTypeId LIKE ?`;
      params.push(`%${req.query.tourType}%`);
    }

    if (req.query.travelMonth) {
      const month = moment(req.query.travelMonth, "YYYY-MM-DD").format("MM");
      query += ` AND MONTH(g.startDate) = ?`;
      params.push(month);
    }

    if (req.query.cityId) {
      query += `
        AND g.groupTourId IN (
          SELECT groupTourId FROM grouptourscity WHERE cityId = ?
        )
      `;
      params.push(req.query.cityId);
    }

    if (req.query.departureTypeId) {
      query += `
        AND g.departureTypeId IN (
          SELECT departureTypeId FROM dropdowndeparturetype WHERE departureTypeId = ?
        )
      `;
      params.push(req.query.departureTypeId);
    }

    query += ` ORDER BY g.created_at DESC`;

    // ---------------- Pagination ----------------
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;
    query += ` LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    // ---------------- Execute query ----------------
    const [groupTours] = await db.query(query, params);

    // Count total rows for pagination
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM grouptours g JOIN tourtype t ON g.tourTypeId = t.tourTypeId WHERE g.groupTourProcess = 0`
    );
    const total = countResult[0].total;

    // Map results
    const groupTours_array = await Promise.all(
      groupTours.map(async (g) => {
        const [bookedSeatsResult] = await db.query(
          `SELECT COUNT(*) as bookedSeats FROM grouptourguestdetails WHERE groupTourId = ? AND isCancel = 0`,
          [g.groupTourId]
        );
        const bookedSeats = bookedSeatsResult[0]?.bookedSeats || 0;

        return {
          groupTourId: g.groupTourId,
          tourName: g.tourName,
          tourCode: g.tourCode,
          tourTypeName: g.tourTypeName,
          startDate: moment(g.startDate).format("DD-MM-YYYY"),
          endDate: moment(g.endDate).format("DD-MM-YYYY"),
          duration: `${g.days}D-${g.night}N`,
          totalSeats: g.totalSeats,
          seatsBook: bookedSeats,
          seatsAval: g.totalSeats - bookedSeats,
          pdfUrl: g.pdfUrl
            ? `${req.protocol}://${req.get("host")}${g.pdfUrl}`
            : "",
          printUrl: g.printUrl
            ? `${req.protocol}://${req.get("host")}${g.printUrl}`
            : "",
          predepartureUrl: g.predepartureUrl
            ? `${req.protocol}://${req.get("host")}${g.predepartureUrl}`
            : "",
          websiteBanner: g.websiteBanner,
          websiteDescription: g.websiteDescription,
        };
      })
    );

    return res.status(200).json({
      data: groupTours_array,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("[/view-draft-group-tour] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// router.get("/view-custom-tour", async (req, res) => {
//   try {
//     // ✅ Token validation
//     const tokenData = await CommonController.checkToken(req.headers["token"], [110]);
//     if (tokenData.error) {
//       return res.status(401).json(tokenData);
//     }

//     // ---------------- Base query ----------------
//     let query = `
//       SELECT e.*, d.destinationName
//       FROM enquirycustomtours e
//       JOIN dropdowndestination d ON e.destinationId = d.destinationId
//       WHERE e.enquiryProcess = 2
//     `;
//     const params = [];

//     // ---------------- Filters ----------------
//     if (req.query.startDate && req.query.endDate) {
//       query += ` AND e.startDate >= ? AND e.endDate <= ?`;
//       params.push(req.query.startDate, req.query.endDate);
//     } else if (req.query.startDate) {
//       query += ` AND e.startDate >= ?`;
//       params.push(req.query.startDate);
//     } else if (req.query.endDate) {
//       query += ` AND e.endDate <= ?`;
//       params.push(req.query.endDate);
//     }

//     if (req.query.groupName) {
//       query += ` AND e.groupName LIKE ?`;
//       params.push(`%${req.query.groupName}%`);
//     }

//     if (req.query.duration) {
//       query += ` AND CONCAT(e.days,'D-', e.nights,'N') LIKE ?`;
//       params.push(`%${req.query.duration}%`);
//     }

//     if (req.query.travelMonth) {
//       const month = moment(req.query.travelMonth, "YYYY-MM-DD").format("MM");
//       query += ` AND MONTH(e.startDate) = ?`;
//       params.push(month);
//     }

//     // City filter (JSON column)
//     if (req.query.cityId) {
//       const cityId = parseInt(req.query.cityId);
//       query += ` AND JSON_CONTAINS(e.cities, ?)`;
//       params.push(JSON.stringify([cityId])); // convert cityId to JSON array
//     }

//     query += ` ORDER BY e.created_at DESC`;

//     // ---------------- Pagination ----------------
//     const perPage = parseInt(req.query.perPage) || 10;
//     const page = parseInt(req.query.page) || 1;
//     const offset = (page - 1) * perPage;
//     query += ` LIMIT ? OFFSET ?`;
//     params.push(perPage, offset);

//     // Execute query
//     const [customTours] = await db.query(query, params);

//     // Count total rows (for pagination)
//     const [countResult] = await db.query(
//       `SELECT COUNT(*) as total FROM enquirycustomtours WHERE enquiryProcess = 2`
//     );
//     const total = countResult[0].total;

//     // Map results
//     const confirmCustomArray = customTours.map((tour) => ({
//       enquiryCustomId: tour.enquiryCustomId,
//       uniqueEnqueryId: tour.enquiryId.toString().padStart(4, "0"),
//       groupName: tour.groupName,
//       tourType: tour.destinationName,
//       startDate: moment(tour.startDate).format("DD-MM-YYYY"),
//       endDate: moment(tour.endDate).format("DD-MM-YYYY"),
//       duration: `${tour.days}D-${tour.nights}N`,
//     }));

//     return res.status(200).json({
//       data: confirmCustomArray,
//       total,
//       currentPage: page,
//       perPage,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("[/view-custom-tour] Error:", error.message);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// });

// ---------------- VIEW CUSTOM TOUR ----------------

router.get("/view-custom-tour", async (req, res) => {
  try {
    // ✅ Token validation
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      110,
    ]);
    if (tokenData.error) return res.status(401).json(tokenData);

    let query = `
      SELECT e.*, d.destinationName
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 2
    `;
    const params = [];

    // ---------------- Filters ----------------
    if (req.query.startDate && req.query.endDate) {
      query += ` AND e.startDate >= ? AND e.endDate <= ?`;
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      query += ` AND e.startDate >= ?`;
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      query += ` AND e.endDate <= ?`;
      params.push(req.query.endDate);
    }

    if (req.query.groupName) {
      query += ` AND e.groupName LIKE ?`;
      params.push(`%${req.query.groupName}%`);
    }

    if (req.query.duration) {
      query += ` AND CONCAT(e.days, 'D-', e.nights, 'N') LIKE ?`;
      params.push(`%${req.query.duration}%`);
    }

    if (req.query.travelMonth) {
      const month = moment(req.query.travelMonth, "YYYY-MM-DD").format("MM");
      query += ` AND MONTH(e.startDate) = ?`;
      params.push(month);
    }

    if (req.query.cityId) {
      // Assuming `cities` column is JSON array
      query += ` AND JSON_CONTAINS(e.cities, ?)`;
      params.push(`[${parseInt(req.query.cityId)}]`);
    }

    query += ` ORDER BY e.created_at DESC`;

    // ---------------- Pagination ----------------
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;
    query += ` LIMIT ? OFFSET ?`;
    params.push(perPage, offset);

    // Execute query
    const [customTours] = await db.query(query, params);

    // Count total rows for filtered results
    let countQuery = `
      SELECT COUNT(*) as total
      FROM enquirycustomtours e
      JOIN dropdowndestination d ON e.destinationId = d.destinationId
      WHERE e.enquiryProcess = 2
    `;
    const countParams = [];

    if (req.query.startDate && req.query.endDate) {
      countQuery += ` AND e.startDate >= ? AND e.endDate <= ?`;
      countParams.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      countQuery += ` AND e.startDate >= ?`;
      countParams.push(req.query.startDate);
    } else if (req.query.endDate) {
      countQuery += ` AND e.endDate <= ?`;
      countParams.push(req.query.endDate);
    }

    if (req.query.groupName) {
      countQuery += ` AND e.groupName LIKE ?`;
      countParams.push(`%${req.query.groupName}%`);
    }

    if (req.query.duration) {
      countQuery += ` AND CONCAT(e.days, 'D-', e.nights, 'N') LIKE ?`;
      countParams.push(`%${req.query.duration}%`);
    }

    if (req.query.travelMonth) {
      const month = moment(req.query.travelMonth, "YYYY-MM-DD").format("MM");
      countQuery += ` AND MONTH(e.startDate) = ?`;
      countParams.push(month);
    }

    if (req.query.cityId) {
      countQuery += ` AND JSON_CONTAINS(e.cities, ?)`;
      countParams.push(`[${parseInt(req.query.cityId)}]`);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    // Map results
    const confirmCustomArray = customTours.map((c) => ({
      enquiryCustomId: c.enquiryCustomId,
      uniqueEnqueryId: String(c.enquiryId).padStart(4, "0"),
      groupName: c.groupName,
      tourType: c.destinationName,
      startDate: moment(c.startDate).format("DD-MM-YYYY"),
      endDate: moment(c.endDate).format("DD-MM-YYYY"),
      duration: `${c.days}D-${c.nights}N`,
    }));

    return res.status(200).json({
      data: confirmCustomArray,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("[/view-custom-tour] Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET tailor-made tours listing
router.get("/view-tailor-made", async (req, res) => {
  try {
    const {
      travelStartDate,
      travelEndDate,
      tourName,
      totalDuration,
      tourType,
      travelMonth,
      cityId,
      departureTypeId,
      perPage,
      page,
    } = req.query;

    const limit = perPage ? parseInt(perPage) : 10;
    const currentPage = page ? parseInt(page) : 1;
    const offset = (currentPage - 1) * limit;

    let baseQuery = `
      SELECT t.*, tt.tourTypeName
      FROM tailormades t
      JOIN tourtype tt ON t.tourTypeId = tt.tourTypeId
    `;
    let conditions = [];
    let params = [];

    // Searching conditions
    if (travelStartDate && travelEndDate) {
      conditions.push("t.startDate >= ? AND t.endDate <= ?");
      params.push(
        moment(travelStartDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
      params.push(
        moment(travelEndDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }
    if (travelStartDate && !travelEndDate) {
      conditions.push("t.startDate >= ?");
      params.push(
        moment(travelStartDate).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }
    if (travelEndDate && !travelStartDate) {
      conditions.push("t.endDate <= ?");
      params.push(
        moment(travelEndDate).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      );
    }
    if (tourName) {
      conditions.push("t.tourName LIKE ?");
      params.push(`%${tourName}%`);
    }
    if (totalDuration) {
      conditions.push("CONCAT(t.days, 'D-', t.night, 'N') LIKE ?");
      params.push(`%${totalDuration}%`);
    }
    if (tourType) {
      conditions.push("tt.tourTypeId LIKE ?");
      params.push(`%${tourType}%`);
    }
    if (travelMonth) {
      const numericMonth = moment(travelMonth).format("MM");
      conditions.push("MONTH(t.startDate) = ?");
      params.push(numericMonth);
    }
    if (cityId) {
      baseQuery +=
        " JOIN tailormadecity tc ON t.tailorMadeId = tc.tailorMadeId";
      conditions.push("tc.cityId = ?");
      params.push(cityId);
    }
    if (departureTypeId) {
      baseQuery +=
        " JOIN dropdowndeparturetype ddt ON t.departureTypeId = ddt.departureTypeId";
      conditions.push("ddt.departureTypeId = ?");
      params.push(departureTypeId);
    }

    // Apply conditions
    if (conditions.length > 0) {
      baseQuery += " WHERE " + conditions.join(" AND ");
    }

    // Order by
    baseQuery += " ORDER BY t.created_at DESC";

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as subquery`;
    const [countRows] = await db.query(countQuery, params);
    const total = countRows[0].total;

    // Final query with limit/offset
    const finalQuery = `${baseQuery} LIMIT ? OFFSET ?`;
    const [rows] = await db.query(finalQuery, [...params, limit, offset]);

    // Build response array
    const tailorMade_array = rows.map((value) => ({
      tailorMadeId: value.tailorMadeId,
      tourName: value.tourName,
      tourCode: value.tourCode,
      tourTypeName: value.tourTypeName,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      duration: `${value.days}D-${value.night}N`,
      totalSeats: value.totalSeats,
      pdfUrl: value.pdfUrl
        ? `${req.protocol}://${req.get("host")}${value.pdfUrl}`
        : "",
      printUrl: value.printUrl
        ? `${req.protocol}://${req.get("host")}${value.printUrl}`
        : "",
      predepartureUrl: value.predepartureUrl
        ? `${req.protocol}://${req.get("host")}${value.predepartureUrl}`
        : "",
      websiteBanner: value.websiteBanner,
      websiteDescription: value.websiteDescription,
    }));

    return res.status(200).json({
      data: tailorMade_array,
      total,
      currentPage,
      perPage: limit,
      lastPage: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[/view-tailor-made] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/view-details-tailor-made", async (req, res) => {
  try {
    // Validation inside the function
    if (!req.query.tailorMadeId) {
      return res.status(422).json({ message: ["tailorMadeId is required"] });
    }

    const tailorMadeId = req.query.tailorMadeId;

    // Check if tailorMade exists
    const [tailorMadeExists] = await db.query(
      "SELECT 1 FROM tailormades WHERE tailorMadeId = ?",
      [tailorMadeId]
    );

    if (!tailorMadeExists) {
      return res
        .status(404)
        .json({ message: "Tailor made details does not exist" });
    }

    // Check token
    const token = req.headers["token"];
    const tokenData = await checkToken(token, [348]); // adjust role array
    if (tokenData.error) {
      return res
        .status(tokenData.status || 401)
        .json({ message: tokenData.error });
    }

    // Fetch main tailor-made details
    const [detailTailorMade] = await db.query(
      `SELECT t.*, c.countryName, s.stateName, tt.tourTypeName, dd.destinationName, 
                    dt.departureName, dv.vehicleName, dm.mealPlanName, dk.kitchenName, dmt.mealTypeName
             FROM tailormades t
             JOIN tourtype tt ON t.tourTypeId = tt.tourTypeId
             LEFT JOIN countries c ON t.countryId = c.countryId
             LEFT JOIN states s ON t.stateId = s.stateId
             JOIN dropdowndestination dd ON t.destinationId = dd.destinationId
             LEFT JOIN dropdowndeparturetype dt ON t.departureTypeId = dt.departureTypeId
             LEFT JOIN dropdownvehicle dv ON t.vehicleId = dv.vehicleId
             JOIN dropdownmealplan dm ON t.mealPlanId = dm.mealPlanId
             LEFT JOIN dropdownkitchen dk ON t.kitchenId = dk.kitchenId
             LEFT JOIN dropdownmealtype dmt ON t.mealTypeId = dmt.mealTypeId
             WHERE t.tailorMadeId = ?`,
      [tailorMadeId]
    );

    if (!detailTailorMade.length) {
      return res.status(404).json({ message: "Tailor made details not found" });
    }

    const firstTailorMade = detailTailorMade[0];
    const pdfUrl = firstTailorMade.pdfUrl
      ? url.resolve(
          req.protocol + "://" + req.get("host"),
          firstTailorMade.pdfUrl
        )
      : null;
    const predepartureUrl = firstTailorMade.predepartureUrl
      ? url.resolve(
          req.protocol + "://" + req.get("host"),
          firstTailorMade.predepartureUrl
        )
      : null;
    const printUrl = firstTailorMade.printUrl
      ? url.resolve(
          req.protocol + "://" + req.get("host"),
          firstTailorMade.printUrl
        )
      : "";

    // Fetch related data
    const [cityId] = await db.query(
      `SELECT c.citiesId, c.citiesName
             FROM tailormadecity tc
             JOIN cities c ON tc.cityId = c.citiesId
             WHERE tc.tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [tourPrice] = await db.query(
      `SELECT type, destination, hotelName, tourPrice, offerPrice, commissionPrice
             FROM tailormadepricediscount
             WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [detailedItinerary] = await db.query(
      `SELECT * FROM tailormadedetailitinerary WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    // parse JSON fields
    detailedItinerary.forEach((item) => {
      if (item.mealTypeId) item.mealTypeId = JSON.parse(item.mealTypeId);
    });

    const [detailedItineraryMealType] = await db.query(
      `SELECT mealTypeId FROM tailormadedetailitinerary WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );
    detailedItineraryMealType.forEach((item) => {
      if (item.mealTypeId) item.mealTypeId = JSON.parse(item.mealTypeId);
    });

    const [trainDetails] = await db.query(
      `SELECT * FROM tailormadetrain WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [flightDetails] = await db.query(
      `SELECT journey, flight, airline, class, \`from\`, fromDate, fromTime, \`to\`, toDate, toTime, weight
             FROM tailormadeflight WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [d2d] = await db.query(
      `SELECT * FROM tailormaded2dtime WHERE tailorMadeId = ? LIMIT 1`,
      [tailorMadeId]
    );

    const [tailormadeinclusions] = await db.query(
      `SELECT * FROM tailormadeinclusions WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [tailormadeexclusions] = await db.query(
      `SELECT * FROM tailormadeexclusions WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [notes] = await db.query(
      `SELECT * FROM tailormadedetails WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [visaDocuments] = await db.query(
      `SELECT * FROM tailormadevisadocumentsgt WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [tailorMadeitineraryimages] = await db.query(
      `SELECT * FROM tailormadeitineraryimages WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    return res.status(200).json({
      detailTailorMade,
      detailedItinerary,
      detailedItineraryMealType,
      tourPrice,
      trainDetails,
      flightDetails,
      dtod: d2d,
      city: cityId,
      visaDocuments,
      tailormadeinclusions,
      tailormadeexclusions,
      notes,
      tailorMadeitineraryimages,
      pdfUrl,
      predepartureUrl,
      printUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/get-edit-tailor-made", async (req, res) => {
  try {
    const tailorMadeId = req.query.tailorMadeId;

    // Validation inside the function
    if (!tailorMadeId) {
      return res.status(422).json({ message: ["tailorMadeId is required"] });
    }

    // Check if tailorMade exists
    const [tailormadeExists] = await db.query(
      "SELECT 1 FROM tailormades WHERE tailorMadeId = ?",
      [tailorMadeId]
    );

    if (!tailormadeExists.length) {
      return res
        .status(404)
        .json({ message: "Tailor made details does not exist" });
    }

    // Check token
    const token = req.headers["token"];
    const tokenData = await checkToken(token, [351]);
    if (tokenData.error) {
      return res
        .status(tokenData.status || 401)
        .json({ message: tokenData.error });
    }

    // Get main tailorMade details with joins
    const [detailtailormade] = await db.query(
      `SELECT t.*, c.countryName, s.stateName, tt.tourTypeName, dd.destinationName, 
                    dt.departureName, dv.vehicleName, dm.mealPlanName, dk.kitchenName, dmt.mealTypeName
             FROM tailormades t
             JOIN tourtype tt ON t.tourTypeId = tt.tourTypeId
             LEFT JOIN countries c ON t.countryId = c.countryId
             LEFT JOIN states s ON t.stateId = s.stateId
             JOIN dropdowndestination dd ON t.destinationId = dd.destinationId
             LEFT JOIN dropdowndeparturetype dt ON t.departureTypeId = dt.departureTypeId
             LEFT JOIN dropdownvehicle dv ON t.vehicleId = dv.vehicleId
             JOIN dropdownmealplan dm ON t.mealPlanId = dm.mealPlanId
             LEFT JOIN dropdownkitchen dk ON t.kitchenId = dk.kitchenId
             LEFT JOIN dropdownmealtype dmt ON t.mealTypeId = dmt.mealTypeId
             WHERE t.tailorMadeId = ? LIMIT 1`,
      [tailorMadeId]
    );

    if (!detailtailormade.length) {
      return res.status(404).json({ message: "Tailor made details not found" });
    }

    const mainTailor = detailtailormade[0];

    // Fetch related data
    const [cityId] = await db.query(
      `SELECT c.citiesId, c.citiesName
             FROM tailormadecity tc
             JOIN cities c ON tc.cityId = c.citiesId
             WHERE tc.tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [tourPrice] = await db.query(
      `SELECT type, destination, hotelName, tourPrice, offerPrice, commissionPrice
             FROM tailormadepricediscount WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [detailedItinerary] = await db.query(
      `SELECT * FROM tailormadedetailitinerary WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    for (const item of detailedItinerary) {
      if (item.mealTypeId) item.mealTypeId = JSON.parse(item.mealTypeId);

      const [images] = await db.query(
        `SELECT * FROM tailormadeitineraryimages 
                 WHERE tailorMadeId = ? AND tailorMadeDetailineraryId = ?`,
        [tailorMadeId, item.tailorMadeDetailineraryId]
      );

      item.tailorMadeitineraryimages = images;
    }

    const [detailedItineraryMealType] = await db.query(
      `SELECT mealTypeId FROM tailormadedetailitinerary WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    detailedItineraryMealType.forEach((item) => {
      if (item.mealTypeId) item.mealTypeId = JSON.parse(item.mealTypeId);
    });

    const [trainDetails] = await db.query(
      `SELECT * FROM tailormadetrain WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [flightDetails] = await db.query(
      `SELECT * FROM tailormadeflight WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [d2d] = await db.query(
      `SELECT * FROM tailormaded2dtime WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [tailormadeinclusions] = await db.query(
      `SELECT * FROM tailormadeinclusions WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [tailormadeexclusions] = await db.query(
      `SELECT * FROM tailormadeexclusions WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [note] = await db.query(
      `SELECT * FROM tailormadedetails WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    const [visaDocuments] = await db.query(
      `SELECT * FROM tailormadevisadocumentsgt WHERE tailorMadeId = ? LIMIT 1`,
      [tailorMadeId]
    );

    const [tailormadeitineraryimages] = await db.query(
      `SELECT * FROM tailormadeitineraryimages WHERE tailorMadeId = ?`,
      [tailorMadeId]
    );

    // Construct response object
    // const myObj = {
    //     tailorMadeId: mainTailor.tailorMadeId,
    //     tourName: mainTailor.tourName,
    //     bgImage: mainTailor.bgImage,
    //     tourManager: mainTailor.tourManager,
    //     tourCode: mainTailor.tourCode,
    //     tourTypeId: mainTailor.tourTypeId,
    //     tourTypeName: mainTailor.tourTypeName,
    //     countryId: mainTailor.countryId,
    //     countryName: mainTailor.countryName,
    //     stateId: mainTailor.stateId,
    //     stateName: mainTailor.stateName,
    //     destinationId: mainTailor.destinationId,
    //     destinationName: mainTailor.destinationName,
    //     departureTypeId: mainTailor.departureTypeId,
    //     departureName: mainTailor.departureName,
    //     vehicleId: mainTailor.vehicleId,
    //     vehicleName: mainTailor.vehicleName,
    //     mealPlanId: mainTailor.mealPlanId,
    //     mealPlanName: mainTailor.mealPlanName,
    //     kitchenId: mainTailor.kitchenId,
    //     kitchenName: mainTailor.kitchenName,
    //     mealTypeId: mainTailor.mealTypeId,
    //     mealTypeName: mainTailor.mealTypeName,
    //     totalSeats: mainTailor.totalSeats,
    //     days: mainTailor.days,
    //     night: mainTailor.night,
    //     startDate: mainTailor.startDate,
    //     endDate: mainTailor.endDate,
    //     uniqueExperience: mainTailor.uniqueExperience || '',
    //     websiteBanner: mainTailor.websiteBanner,
    //     websiteDescription: mainTailor.websiteDescription,
    //     detailedItinerary,
    //     detailedItineraryMealType,
    //     tourPrice,
    //     trainDetails,
    //     flightDetails,
    //     dtod: d2d,
    //     city: cityId,
    //     visaDocuments: visaDocuments || {},
    //     tailormadeinclusions,
    //     tailormadeexclusions,
    //     tailormadeitineraryimages,
    //     note
    // };
    const myObj = {
      tailorMadeId: mainTailor.tailorMadeId,
      tourName: mainTailor.tourName,
      bgImage: mainTailor.bgImage,
      tourManager: mainTailor.tourManager,
      tourCode: mainTailor.tourCode,
      tourTypeId: mainTailor.tourTypeId,
      tourTypeName: mainTailor.tourTypeName,
      countryId: mainTailor.countryId,
      countryName: mainTailor.countryName,
      stateId: mainTailor.stateId,
      stateName: mainTailor.stateName,
      destinationId: mainTailor.destinationId,
      destinationName: mainTailor.destinationName,
      departureTypeId: mainTailor.departureTypeId,
      departureName: mainTailor.departureName,
      vehicleId: mainTailor.vehicleId,
      vehicleName: mainTailor.vehicleName,
      mealPlanId: mainTailor.mealPlanId,
      mealPlanName: mainTailor.mealPlanName,
      kitchenId: mainTailor.kitchenId,
      kitchenName: mainTailor.kitchenName,
      mealTypeId: mainTailor.mealTypeId,
      mealTypeName: mainTailor.mealTypeName,
      totalSeats: mainTailor.totalSeats,
      days: mainTailor.days,
      night: mainTailor.night,
      startDate: mainTailor.startDate,
      endDate: mainTailor.endDate,
      uniqueExperience: mainTailor.uniqueExperience || "",
      websiteBanner: mainTailor.websiteBanner,
      websiteDescription: mainTailor.websiteDescription,
      detailedItinerary,
      detailedItineraryMealType,
      tourPrice,
      trainDetails,
      flightDetails,
      dtod: d2d,
      city: cityId,
      visaDocuments:
        visaDocuments && visaDocuments.visaDocuments
          ? visaDocuments.visaDocuments
          : "",
      visaFee:
        visaDocuments && visaDocuments.visaFee ? visaDocuments.visaFee : "",
      visaInstruction:
        visaDocuments && visaDocuments.visaInstruction
          ? visaDocuments.visaInstruction
          : "",
      visaAlerts:
        visaDocuments && visaDocuments.visaAlerts
          ? visaDocuments.visaAlerts
          : "",
      insuranceDetails:
        visaDocuments && visaDocuments.insuranceDetails
          ? visaDocuments.insuranceDetails
          : "",
      euroTrainDetails:
        visaDocuments && visaDocuments.euroTrainDetails
          ? visaDocuments.euroTrainDetails
          : "",
      nriOriForDetails:
        visaDocuments && visaDocuments.nriOriForDetails
          ? visaDocuments.nriOriForDetails
          : "",
      shopping: mainTailor.shopping || "",
      weather: mainTailor.weather || "",
      tailormadeinclusions,
      tailormadeexclusions,
      tailormadeitineraryimages,
      note,
    };

    return res.status(200).json({ data: myObj });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// router.post("/update-tailor-made-list", async (req, res) => {
//   let { tailorMadeId } = req.body;

//   const {
//     tourTypeId,
//     tourName,
//     tourCode,
//     stateId,
//     countryId,
//     destinationId,
//     night,
//     days,
//     mealPlanId,
//     bgImage,
//     shopping,
//     weather,
//     uniqueExperience,
//     websiteBanner,
//     websiteDescription,
//     cityId,
//     detailedItinerary,
//     tailormadeinclusions,
//     tailormadeexclusions,
//     note,
//     hotelprice,
//     visaDocuments,
//     visaFee,
//     visaInstruction,
//     visaAlerts,
//     insuranceDetails,
//     euroTrainDetails,
//     nriOriForDetails,
//   } = req.body;

//   console.log("Incoming Body:", req.body);

//   // ✅ Fallbacks for tailorMadeId
//   if (!tailorMadeId) {
//     if (req.body.detailedItinerary?.[0]?.tailorMadeId) {
//       tailorMadeId = req.body.detailedItinerary[0].tailorMadeId;
//     } else if (req.body.tailormadeinclusions?.[0]?.tailorMadeId) {
//       tailorMadeId = req.body.tailormadeinclusions[0].tailorMadeId;
//     } else if (req.body.note?.[0]?.tailorMadeId) {
//       tailorMadeId = req.body.note[0].tailorMadeId;
//     }
//   }

//   try {
//     // ✅ Validation
//     if (!tailorMadeId) {
//       return res.status(400).json({ message: "tailorMadeId is required" });
//     }

//     // ✅ Token check
//     const tokenData = await CommonController.checkToken(req.headers["token"], [
//       351,
//     ]);
//     if (tokenData.error) {
//       return res.status(401).json({ message: tokenData.message });
//     }

//     // ✅ Check if exists
//     const [checkTour] = await db("tailormades")
//       .where("tailorMadeId", tailorMadeId)
//       .select("*");

//     if (!checkTour) {
//       return res.status(404).json({ message: "Tailor made not found" });
//     }

//     // ✅ Delete old PDFs
//     const pdfFields = ["pdfUrl", "predepartureUrl", "printUrl"];
//     for (const field of pdfFields) {
//       if (checkTour[field]) {
//         const modifiedPdfUrl = checkTour[field].replace("/public", "");
//         const filePath = path.join(__dirname, "../public", modifiedPdfUrl);
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       }
//     }

//     // ✅ Begin transaction
//     await db.transaction(async (trx) => {
//       // Update main table
//       await trx("tailormades")
//         .where({ tailorMadeId })
//         .update({
//           tourTypeId,
//           tourName,
//           tourCode,
//           stateId,
//           countryId,
//           destinationId,
//           night,
//           days,
//           mealPlanId,
//           bgImage,
//           shopping: shopping || "",
//           weather: weather || "",
//           pdfUrl: null,
//           predepartureUrl: null,
//           printUrl: null,
//           uniqueExperience,
//           websiteBanner,
//           websiteDescription,
//         });

//       // ✅ City
//       await trx("tailormadecity").where({ tailorMadeId }).del();
//       for (const cId of cityId) {
//         await trx("tailormadecity").insert({
//           tailorMadeId,
//           cityId: cId,
//         });
//       }

//       // ✅ Detailed Itinerary
//       await trx("tailormadedetailitinerary").where({ tailorMadeId }).del();
//       if (detailedItinerary.length < days) {
//         throw new Error(
//           `Number of detailed itineraries should be at least ${days}`
//         );
//       }
//       for (const value of detailedItinerary) {
//         await trx("tailormadedetailitinerary").insert({
//           tailorMadeId,
//           date: value.date,
//           title: value.title,
//           description: value.description,
//           distance: value.distance,
//           nightStayAt: value.nightStayAt,
//           mealTypeId: JSON.stringify(value.mealTypeId),
//           fromCity: value.fromCity,
//           toCity: value.toCity,
//           approxTravelTime: value.approxTravelTime,
//           bannerImage: value.bannerImage,
//           hotelImage: value.hotelImage,
//         });
//       }

//       // ✅ Inclusions
//       await trx("tailormadeinclusions").where({ tailorMadeId }).del();
//       for (const inc of tailormadeinclusions) {
//         await trx("tailormadeinclusions").insert({
//           tailorMadeId,
//           description: inc.description,
//         });
//       }

//       // ✅ Exclusions
//       await trx("tailormadeexclusions").where({ tailorMadeId }).del();
//       for (const exc of tailormadeexclusions) {
//         await trx("tailormadeexclusions").insert({
//           tailorMadeId,
//           description: exc.description,
//         });
//       }

//       // ✅ Notes
//       await trx("tailormadedetails").where({ tailorMadeId }).del();
//       for (const n of note) {
//         await trx("tailormadedetails").insert({
//           tailorMadeId,
//           note: n.note,
//         });
//       }

//       // ✅ Room price
//       await trx("tailormadepricediscount").where({ tailorMadeId }).del();
//       const cityIdCount = cityId.length;
//       const roomData = [];
//       for (const value of hotelprice) {
//         if (value.hotels.length !== cityIdCount) {
//           throw new Error(
//             "For each type - hotels must match the cityId count."
//           );
//         }
//         for (let i = 0; i < value.hotels.length; i++) {
//           const checkCity = await trx("cities")
//             .where("citiesId", cityId[i])
//             .first();
//           roomData.push({
//             type: value.type,
//             destination: checkCity ? checkCity.citiesName : "-",
//             hotelName: value.hotels[i].hotelName,
//             tailorMadeId,
//             tourPrice: value.hotels[i].tourPrice,
//             offerPrice: value.hotels[i].offerPrice,
//             commissionPrice: value.hotels[i].commissionPrice,
//           });
//         }
//       }
//       if (!roomData.length) {
//         throw new Error("Insertable array is empty");
//       }
//       await trx("tailormadepricediscount").insert(roomData);

//       // ✅ Visa Documents
//       await trx("tailormadevisadocumentsgt")
//         .where({ tailorMadeId })
//         .update({
//           visaDocuments: Array.isArray(visaDocuments)
//             ? JSON.stringify(visaDocuments)
//             : visaDocuments || "",
//           visaFee: visaFee || "",
//           visaInstruction: visaInstruction || "",
//           visaAlerts: visaAlerts || "",
//           insuranceDetails: insuranceDetails || "",
//           euroTrainDetails: euroTrainDetails || "",
//           nriOriForDetails: nriOriForDetails || "",
//         });

//       // ✅ Itinerary Images
//       await trx("tailormadeitineraryimages").where({ tailorMadeId }).del();
//       const [firstDetailId] = await trx("tailormadedetailitinerary")
//         .where({ tailorMadeId })
//         .orderBy("tailorMadeDetailineraryId", "asc")
//         .pluck("tailorMadeDetailineraryId");

//       const imagesData = [];
//       detailedItinerary.forEach((d, index) => {
//         d.tailormadeitineraryimagesList.forEach((img) => {
//           imagesData.push({
//             tailorMadeId,
//             tailorMadeDetailineraryId: firstDetailId + index,
//             itineraryImageName: img.itineraryImageName,
//             itineraryImageUrl: img.itineraryImageUrl,
//           });
//         });
//       });

//       if (!imagesData.length) {
//         throw new Error("Tailor made itinerary images data array is empty");
//       }
//       await trx("tailormadeitineraryimages").insert(imagesData);
//     });

//     return res
//       .status(200)
//       .json({ message: "Tailor made details updated successfully" });
//   } catch (err) {
//     console.error("Error in update-tailor-made-list:", err);
//     return res.status(400).json({ message: err.message });
//   }
// });

//this is not working
router.post("/update-tailor-made-list", async (req, res) => {
  let { tailorMadeId } = req.body;
  const {
    tourTypeId,
    tourName,
    tourCode,
    stateId,
    countryId,
    destinationId,
    night,
    days,
    mealPlanId,
    bgImage,
    shopping,
    weather,
    uniqueExperience,
    websiteBanner,
    websiteDescription,
    cityId = [],
    detailedItinerary = [],
    tailormadeinclusions = [],
    tailormadeexclusions = [],
    note = [],
    hotelprice = [],
    visaDocuments,
    visaFee,
    visaInstruction,
    visaAlerts,
    insuranceDetails,
    euroTrainDetails,
    nriOriForDetails,
  } = req.body;

  const DEFAULT_CLIENTCODE = "CODIGIX01";

  // Fallback tailorMadeId from arrays
  if (!tailorMadeId) {
    if (req.body.detailedItinerary?.[0]?.tailorMadeId) {
      tailorMadeId = req.body.detailedItinerary[0].tailorMadeId;
    } else if (req.body.tailormadeinclusions?.[0]?.tailorMadeId) {
      tailorMadeId = req.body.tailormadeinclusions[0].tailorMadeId;
    } else if (req.body.note?.[0]?.tailorMadeId) {
      tailorMadeId = req.body.note[0].tailorMadeId;
    }
  }

  try {
    if (!tailorMadeId) {
      return res.status(400).json({ message: "tailorMadeId is required" });
    }

    // Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      351,
    ]);
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    // Get existing record
    const [checkTour] = await db.query(
      "SELECT * FROM tailormades WHERE tailorMadeId=?",
      [tailorMadeId]
    );
    if (!checkTour.length) {
      return res.status(404).json({ message: "Tailor made not found" });
    }

    // Delete old PDFs
    for (let field of ["pdfUrl", "predepartureUrl", "printUrl"]) {
      if (checkTour[0][field]) {
        const modifiedPdfUrl = checkTour[0][field].replace("/public", "");
        const filePath = path.join(__dirname, "../public", modifiedPdfUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // --- Update main table ---
      await connection.query(
        `UPDATE tailormades SET 
          tourTypeId=?, tourName=?, tourCode=?, stateId=?, countryId=?, destinationId=?, night=?, days=?, 
          mealPlanId=?, bgImage=?, shopping=?, weather=?, pdfUrl=NULL, predepartureUrl=NULL, printUrl=NULL, 
          uniqueExperience=?, websiteBanner=?, websiteDescription=?
        WHERE tailorMadeId=?`,
        [
          tourTypeId,
          tourName,
          tourCode,
          stateId,
          countryId,
          destinationId,
          night,
          days,
          mealPlanId,
          bgImage,
          shopping,
          weather,
          uniqueExperience,
          websiteBanner,
          websiteDescription,
          tailorMadeId,
        ]
      );

      // --- Cities ---
      await connection.query(
        "DELETE FROM tailormadecity WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      for (const cId of cityId) {
        await connection.query(
          "INSERT INTO tailormadecity (tailorMadeId, cityId) VALUES (?, ?)",
          [tailorMadeId, cId]
        );
      }

      // --- Detailed Itinerary ---
      await connection.query(
        "DELETE FROM tailormadedetailitinerary WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      if (detailedItinerary.length < days) {
        throw new Error(
          `Number of detailed itineraries should be at least ${days}`
        );
      }
      for (const value of detailedItinerary) {
        await connection.query(
          `INSERT INTO tailormadedetailitinerary 
            (tailorMadeId, date, title, description, distance, nightStayAt, mealTypeId, fromCity, toCity, approxTravelTime, bannerImage, hotelImage) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tailorMadeId,
            value.date,
            value.title,
            value.description,
            value.distance,
            value.nightStayAt,
            JSON.stringify(value.mealTypeId),
            value.fromCity,
            value.toCity,
            value.approxTravelTime,
            value.bannerImage,
            value.hotelImage,
          ]
        );
      }

      // --- Inclusions ---
      await connection.query(
        "DELETE FROM tailormadeinclusions WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      for (const inc of tailormadeinclusions) {
        await connection.query(
          "INSERT INTO tailormadeinclusions (tailorMadeId, description, clientcode) VALUES (?, ?, ?)",
          [tailorMadeId, inc.description || "", DEFAULT_CLIENTCODE]
        );
      }

      // --- Exclusions ---
      await connection.query(
        "DELETE FROM tailormadeexclusions WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      for (const exc of tailormadeexclusions) {
        await connection.query(
          "INSERT INTO tailormadeexclusions (tailorMadeId, description, clientcode) VALUES (?, ?, ?)",
          [tailorMadeId, exc.description || "", DEFAULT_CLIENTCODE]
        );
      }

      // --- Notes ---
      await connection.query(
        "DELETE FROM tailormadedetails WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      for (const n of note) {
        await connection.query(
          "INSERT INTO tailormadedetails (tailorMadeId, note, clientcode) VALUES (?, ?, ?)",
          [tailorMadeId, n.note || "", DEFAULT_CLIENTCODE]
        );
      }

      // --- Hotel Price ---
      await connection.query(
        "DELETE FROM tailormadepricediscount WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      const cityCount = cityId.length;
      const priceData = [];
      for (const hp of hotelprice) {
        if (hp.hotels.length !== cityCount) {
          throw new Error(
            "For each type - hotels must match the cityId count."
          );
        }
        for (let i = 0; i < hp.hotels.length; i++) {
          const [city] = await connection.query(
            "SELECT citiesName FROM cities WHERE citiesId=?",
            [cityId[i]]
          );
          priceData.push([
            hp.type || "",
            city[0]?.citiesName || "-",
            hp.hotels[i].hotelName || "-",
            tailorMadeId,
            hp.hotels[i].tourPrice || 0,
            hp.hotels[i].offerPrice || 0,
            hp.hotels[i].commissionPrice || 0,
            DEFAULT_CLIENTCODE,
          ]);
        }
      }
      if (priceData.length) {
        await connection.query(
          `INSERT INTO tailormadepricediscount 
            (type, destination, hotelName, tailorMadeId, tourPrice, offerPrice, commissionPrice, clientcode) 
          VALUES ?`,
          [priceData]
        );
      }

      // --- Visa Documents ---
      await connection.query(
        `UPDATE tailormadevisadocumentsgt SET 
          visaDocuments=?, visaFee=?, visaInstruction=?, visaAlerts=?, insuranceDetails=?, euroTrainDetails=?, nriOriForDetails=? 
        WHERE tailorMadeId=?`,
        [
          visaDocuments,
          visaFee,
          visaInstruction,
          visaAlerts,
          insuranceDetails,
          euroTrainDetails,
          nriOriForDetails,
          tailorMadeId,
        ]
      );

      // --- Itinerary Images ---
      await connection.query(
        "DELETE FROM tailormadeitineraryimages WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      const [ids] = await connection.query(
        `SELECT tailorMadeDetailineraryId FROM tailormadedetailitinerary 
         WHERE tailorMadeId=? ORDER BY tailorMadeDetailineraryId ASC`,
        [tailorMadeId]
      );
      if (!ids.length) throw new Error("No itinerary found to attach images.");

      const imagesData = [];
      detailedItinerary.forEach((value, index) => {
        if (value.tailormadeitineraryimagesList) {
          value.tailormadeitineraryimagesList.forEach((img) => {
            imagesData.push([
              tailorMadeId,
              ids[index].tailorMadeDetailineraryId,
              img.itineraryImageName,
              img.itineraryImageUrl,
            ]);
          });
        }
      });

      if (!imagesData.length) {
        throw new Error("Tailor made itinerary images data array is empty");
      }
      await connection.query(
        `INSERT INTO tailormadeitineraryimages 
          (tailorMadeId, tailorMadeDetailineraryId, itineraryImageName, itineraryImageUrl) 
         VALUES ?`,
        [imagesData]
      );

      await connection.commit();
      return res.json({ message: "Tailor made details updated successfully" });
    } catch (err) {
      await connection.rollback();
      return res.status(400).json({ message: err.message });
    } finally {
      connection.release();
    }
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.get("/delete-tailor-made-list", async (req, res) => {
  const tailorMadeId = parseInt(req.query.tailorMadeId);

  // Validate input
  if (!tailorMadeId || isNaN(tailorMadeId)) {
    return res
      .status(400)
      .json({ message: "tailorMadeId is required and must be numeric" });
  }

  try {
    // ✅ Check token
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      352,
    ]);
    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    // ✅ Start transaction
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // --- Check if tailor-made exists ---
      const [tailorMade] = await connection.query(
        "SELECT * FROM tailormades WHERE tailorMadeId=?",
        [tailorMadeId]
      );
      if (!tailorMade.length) {
        await connection.rollback();
        return res.status(404).json({ message: "Tailor made not found" });
      }

      // --- Delete related entries ---
      const relatedTables = [
        "tailormadetrain",
        "tailormadeflight",
        "tailormaded2dtime",
        "tailormadedetailitinerary",
        "tailormadepricediscount",
        "tailormadevisadocumentsgt",
        "tailormadeinclusions",
        "tailormadeexclusions",
        "tailormadedetails",
        "tailormadeitineraryimages",
        "tailormadecity",
      ];

      for (const table of relatedTables) {
        await connection.query(`DELETE FROM ${table} WHERE tailorMadeId=?`, [
          tailorMadeId,
        ]);
      }

      // --- Delete reviews associated with this tour ---
      await connection.query(
        "DELETE FROM reviews WHERE type=0 AND tourCode=?",
        [tailorMade[0].tourCode]
      );

      // --- Delete main tailor-made record ---
      await connection.query("DELETE FROM tailormades WHERE tailorMadeId=?", [
        tailorMadeId,
      ]);

      await connection.commit();
      return res.json({ message: "Tailor made deleted successfully" });
    } catch (err) {
      await connection.rollback();
      return res.status(500).json({ message: err.message });
    } finally {
      connection.release();
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// // ================================
// // 📌 Upcoming List Group Tour
// // ================================

// ---------------- Expired List ----------------

router.get("/expired-list-group-tour", async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let { perPage, page, search, tourName, startDate, endDate } = req.query;

    perPage = parseInt(perPage) || 10;
    page = parseInt(page) || 1;
    const offset = (page - 1) * perPage;

    let where = "WHERE 1=1 AND e.nextFollowUp < CURDATE()"; // ✅ expired
    const params = [];

    if (search) {
      where +=
        " AND (e.firstName LIKE ? OR e.lastName LIKE ? OR e.contact LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (tourName) {
      where += " AND g.tourName LIKE ?";
      params.push(`%${tourName}%`);
    }
    if (startDate && endDate) {
      where += " AND g.startDate BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        e.enquiryGroupId,
        LPAD(e.enquiryId, 4, '0') AS uniqueEnqueryId,
        DATE_FORMAT(e.created_at, '%d-%m-%Y') AS enquiryDate,
        e.groupName,
        CONCAT(e.firstName, ' ', e.lastName) AS guestName,
        e.contact,
        e.mail,
        (e.adults + e.child) AS paxNo,
        g.tourName,
        DATE_FORMAT(g.startDate, '%d-%m-%Y') AS startDate,
        DATE_FORMAT(g.endDate, '%d-%m-%Y') AS endDate,
        DATE_FORMAT(e.created_at, '%d-%m-%Y') AS lastFollowUp,
        e.remark,
        DATE_FORMAT(e.nextFollowUp, '%d-%m-%Y') AS nextFollowUp,
        e.nextFollowUpTime,
        ? AS userName
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      ${where}
      ORDER BY e.nextFollowUp DESC
      LIMIT ? OFFSET ?
      `,
      [...params, tokenData.userName, perPage, offset]
    );

    const [count] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      ${where}
      `,
      params
    );

    const total = count[0].total;
    const lastPage = Math.ceil(total / perPage);

    res.json({
      data: rows,
      total,
      currentPage: page,
      perPage,
      lastPage,
    });
  } catch (error) {
    console.error("❌ Expired List Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 Route: GET /group-tour/list-group-tour
// ---------------- LIST GROUP TOUR ----------------
router.get("/list-group-tour", async (req, res) => {
  try {
    // ✅ Token validation
    const tokenData = await CommonController.checkToken(
      req.headers["token"],
      [26, 118]
    );
    if (tokenData.error) return res.status(401).json(tokenData);

    // ✅ Pagination
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    // ✅ Filters
    const filters = {
      tourName: req.query.tourName?.trim() || "",
      tourType: req.query.tourType?.trim() || "",
      travelMonth: req.query.travelMonth?.trim() || "",
      totalDuration: req.query.totalDuration?.trim() || "",
      travelStartDate: req.query.travelStartDate?.trim() || "",
      travelEndDate: req.query.travelEndDate?.trim() || "",
      departureType: req.query.departureType?.trim() || "",
      cityId: req.query.cityId?.trim() || "",
    };

    // ---------------- Base query ----------------
    let query = `
      SELECT g.*, t.tourTypeName
      FROM grouptours g
      JOIN tourtype t ON g.tourTypeId = t.tourTypeId
      WHERE 1=1
    `;
    const params = [];

    // Apply filters
    if (filters.tourName) {
      query += " AND g.tourName LIKE ?";
      params.push(`%${filters.tourName}%`);
    }

    if (filters.tourType) {
      query += " AND g.tourTypeId = ?";
      params.push(filters.tourType);
    }

    if (filters.travelMonth) {
      const month = moment(filters.travelMonth, "YYYY-MM-DD").format("MM");
      query += " AND MONTH(g.startDate) = ?";
      params.push(month);
    }

    if (filters.totalDuration) {
      query += " AND CONCAT(g.days,'D-',g.night,'N') LIKE ?";
      params.push(`%${filters.totalDuration}%`);
    }

    if (filters.travelStartDate) {
      query += " AND g.startDate >= ?";
      params.push(filters.travelStartDate);
    }

    if (filters.travelEndDate) {
      query += " AND g.endDate <= ?";
      params.push(filters.travelEndDate);
    }

    if (filters.cityId) {
      query += ` AND g.groupTourId IN (SELECT groupTourId FROM grouptourscity WHERE cityId = ?)`;
      params.push(filters.cityId);
    }

    if (filters.departureType) {
      query += ` AND g.departureTypeId = ?`;
      params.push(filters.departureType);
    }

    query += " ORDER BY g.created_at DESC";
    query += " LIMIT ? OFFSET ?";
    params.push(perPage, offset);

    // ---------------- Execute query ----------------
    const [rows] = await db.query(query, params);

    // Count total rows
    const [countResult] = await db.query(
      "SELECT COUNT(*) as total FROM grouptours g"
    );
    const total = countResult[0].total;

    // Map results
    const data = rows.map((g) => ({
      groupTourId: g.groupTourId,
      tourName: g.tourName,
      tourCode: g.tourCode,
      tourTypeName: g.tourTypeName,
      startDate: moment(g.startDate).format("DD-MM-YYYY"),
      endDate: moment(g.endDate).format("DD-MM-YYYY"),
      duration: `${g.days}D-${g.night}N`,
      totalSeats: g.totalSeats,
      pdfUrl: g.pdfUrl ? `${req.protocol}://${req.get("host")}${g.pdfUrl}` : "",
      printUrl: g.printUrl
        ? `${req.protocol}://${req.get("host")}${g.printUrl}`
        : "",
    }));

    return res.status(200).json({
      message: "Group tours fetched successfully",
      filters,
      data,
      total,
      perPage,
      currentPage: page,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (error) {
    console.error("[/list-group-tour] Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /group-tour-dropdown
// GET /group-tour-dropdown
router.get("/group-tour-dropdown", async (req, res) => {
  try {
    // ✅ Get all tours (no date filter)
    const [groupTours] = await db.execute(
      `SELECT groupTourId, tourName, tourCode, endDate 
       FROM grouptours 
       ORDER BY STR_TO_DATE(endDate, '%Y-%m-%d') ASC`
    );

    let groupToursArray = [];

    if (groupTours.length > 0) {
      groupToursArray = groupTours.map((tour) => ({
        groupTourId: tour.groupTourId,
        tourName: `${tour.tourName} (${tour.tourCode})`,
        endDate: tour.endDate, // return raw endDate for debugging
      }));
    }

    return res.status(200).json({ data: groupToursArray });
  } catch (error) {
    console.error("❌ Error fetching group tours:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /priority-list
// GET /priority-list
router.get("/priority-list", async (req, res) => {
  try {
    // Pagination parameters (default page=1, perPage=10)
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Total count for pagination
    const [countResult] = await db.execute(
      "SELECT COUNT(*) as total FROM dropdownpriority"
    );
    const total = countResult[0].total;

    // Fetch paginated data (use template literals for LIMIT/OFFSET)
    const [priorityList] = await db.execute(
      `SELECT priorityId, priorityName FROM dropdownpriority LIMIT ${perPage} OFFSET ${offset}`
    );

    // Map results
    const priorityArray = priorityList.map((item) => ({
      priorityId: item.priorityId,
      priorityName: item.priorityName,
    }));

    return res.status(200).json({
      data: priorityArray,
      currentPage: page,
      perPage: perPage,
      totalPages: Math.ceil(total / perPage),
      totalItems: total,
    });
  } catch (error) {
    console.error("Error fetching priority list:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// GET /dd-prefix
router.get("/dd-prefix", async (req, res) => {
  try {
    // Fetch all records from dropdownprefix table
    const [ddPrefix] = await db.execute(
      "SELECT preFixId, preFixName FROM dropdownprefix"
    );

    // If no records found, return empty array
    const ddPrefixArray = ddPrefix.length
      ? ddPrefix.map((item) => ({
          preFixId: item.preFixId,
          preFixName: item.preFixName,
        }))
      : [];

    return res.status(200).json({ data: ddPrefixArray });
  } catch (error) {
    console.error("Error fetching dropdown prefix:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /enquiry-reference-list
router.get("/enquiry-reference-list", async (req, res) => {
  try {
    // Pagination parameters (default page=1, perPage=10)
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Total count for pagination
    const [countResult] = await db.execute(
      "SELECT COUNT(*) as total FROM dropdownenquiryreference"
    );
    const total = countResult[0].total;

    // Fetch paginated data (use template literals for LIMIT/OFFSET)
    const [enquiryReferList] = await db.execute(
      `SELECT enquiryReferId, enquiryReferName 
             FROM dropdownenquiryreference 
             LIMIT ${perPage} OFFSET ${offset}`
    );

    // Map results
    const enquiryReferArray = enquiryReferList.map((item) => ({
      enquiryReferId: item.enquiryReferId,
      enquiryReferName: item.enquiryReferName,
    }));

    return res.status(200).json({
      data: enquiryReferArray,
      currentPage: page,
      perPage: perPage,
      totalPages: Math.ceil(total / perPage),
      totalItems: total,
    });
  } catch (error) {
    console.error("Error fetching enquiry reference list:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /dropdown-guest-ref
router.get("/dropdown-guest-refId", async (req, res) => {
  try {
    const [guestIds] = await db.execute(`
      SELECT 
        CASE 
          WHEN guestId IS NOT NULL AND guestId != 0 THEN guestId
          ELSE userId
        END AS guestRefId,
        firstName,
        lastName
      FROM users
      WHERE (firstName IS NOT NULL AND firstName != '')
         OR (lastName IS NOT NULL AND lastName != '')
    `);

    const guestArray = guestIds.map((guest) => ({
      guestRefId: guest.guestRefId,
      firstName: guest.firstName || "",
      lastName: guest.lastName || "",
    }));

    return res.status(200).json({ data: guestArray });
  } catch (error) {
    console.error("Error fetching guest reference IDs:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// // ================================
// // 📌 Upcoming List Group Tour
// // ================================
// router.get("/upcoming-list-group-tour", async (req, res) => {
//   try {
//     const token = req.headers["token"];
//     const tokenData = await checkToken(token, [26, 118]);

//     if (tokenData.error) {
//       return res.status(401).json({ message: tokenData.message });
//     }

//     const today = moment().format("YYYY-MM-DD");

//     let query = `
//       SELECT e.*, g.tourName, g.startDate, g.endDate
//       FROM enquirygrouptours e
//       JOIN grouptours g ON e.groupTourId = g.groupTourId
//       WHERE e.enquiryProcess = 1
//         AND e.nextFollowUp > ?
//         AND e.createdBy = ?
//     `;
//     const params = [today, tokenData.userId];

//     // ✅ Filters
//     if (req.query.startDate && req.query.endDate) {
//       query += " AND g.startDate >= ? AND g.endDate <= ?";
//       params.push(req.query.startDate, req.query.endDate);
//     } else if (req.query.startDate) {
//       query += " AND g.startDate >= ?";
//       params.push(req.query.startDate);
//     } else if (req.query.endDate) {
//       query += " AND g.endDate <= ?";
//       params.push(req.query.endDate);
//     }

//     if (req.query.search) {
//       query +=
//         " AND CONCAT(COALESCE(e.firstName,''), ' ', COALESCE(e.lastName,'')) LIKE ?";
//       params.push(`%${req.query.search}%`);
//     }

//     if (req.query.tourName) {
//       query += " AND g.tourName LIKE ?";
//       params.push(`%${req.query.tourName}%`);
//     }

//     query += " ORDER BY e.nextFollowUp ASC, e.nextFollowUpTime ASC";

//     const [rows] = await pool.query(query, params);

//     // ✅ Pagination manually
//     const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
//     const page = req.query.page ? parseInt(req.query.page) : 1;
//     const offset = (page - 1) * perPage;

//     const paginated = rows.slice(offset, offset + perPage);

//     const data = paginated.map((value) => ({
//       enquiryGroupId: value.enquiryGroupId,
//       uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
//       enquiryDate: moment(value.created_at).format("DD-MM-YYYY"),
//       groupName: value.groupName,
//       guestName: `${value.firstName} ${value.lastName}`,
//       contact: value.contact,
//       tourName: value.tourName,
//       startDate: moment(value.startDate).format("DD-MM-YYYY"),
//       endDate: moment(value.endDate).format("DD-MM-YYYY"),
//       paxNo: value.adults + value.child,
//       lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
//       remark: value.remark,
//       nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
//       nextFollowUpTime: value.nextFollowUpTime,
//       userName: tokenData.userName,
//     }));

//     res.json({
//       data,
//       total: rows.length,
//       currentPage: page,
//       perPage,
//       lastPage: Math.ceil(rows.length / perPage),
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server Error" });
//   }
// });

// // ================================
// // 📌 Expired List Group Tour
// // ================================
// router.get("/expired-list-group-tour", async (req, res) => {
//   try {
//     const token = req.headers["token"];
//     const tokenData = await checkToken(token, [26, 118]);

//     if (tokenData.error) {
//       return res.status(401).json({ message: tokenData.message });
//     }

//     let query = `
//       SELECT e.*, g.tourName, g.startDate, g.endDate
//       FROM enquirygrouptours e
//       JOIN grouptours g ON e.groupTourId = g.groupTourId
//       WHERE e.enquiryProcess = 1
//         AND e.createdBy = ?
//         AND (
//           e.nextFollowUp < CURDATE()
//           OR (e.nextFollowUp = CURDATE() AND e.nextFollowUpTime < CURTIME())
//         )
//     `;
//     const params = [tokenData.userId];

//     // ✅ Filters
//     if (req.query.startDate && req.query.endDate) {
//       query += " AND g.startDate >= ? AND g.endDate <= ?";
//       params.push(req.query.startDate, req.query.endDate);
//     } else if (req.query.startDate) {
//       query += " AND g.startDate >= ?";
//       params.push(req.query.startDate);
//     } else if (req.query.endDate) {
//       query += " AND g.endDate <= ?";
//       params.push(req.query.endDate);
//     } else if (req.query.search) {
//       query += " AND CONCAT(e.firstName, ' ', e.lastName) LIKE ?";
//       params.push(`%${req.query.search}%`);
//     } else if (req.query.tourName) {
//       query += " AND g.tourName LIKE ?";
//       params.push(`%${req.query.tourName}%`);
//     }

//     query += " ORDER BY e.nextFollowUp DESC, e.nextFollowUpTime DESC";

//     const [rows] = await pool.query(query, params);

//     // ✅ Pagination
//     const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
//     const page = req.query.page ? parseInt(req.query.page) : 1;
//     const offset = (page - 1) * perPage;

//     const paginated = rows.slice(offset, offset + perPage);

//     const data = paginated.map((value) => ({
//       enquiryGroupId: value.enquiryGroupId,
//       enquiryDate: moment(value.created_at).format("DD-MM-YYYY"),
//       groupName: value.groupName,
//       guestName: `${value.firstName} ${value.lastName}`,
//       uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
//       contact: value.contact,
//       tourName: value.tourName,
//       startDate: value.startDate,
//       endDate: value.endDate,
//       paxNo: value.adults + value.child,
//       lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
//       nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
//       nextFollowUpTime: value.nextFollowUpTime,
//       userName: tokenData.userName,
//     }));

//     res.json({
//       data,
//       total: rows.length,
//       currentPage: page,
//       perPage,
//       lastPage: Math.ceil(rows.length / perPage),
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server Error" });
//   }
// });

// ================================
// 📌 Upcoming List Group Tour
// ================================
router.get("/upcoming-list-group-tour", async (req, res) => {
  try {
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [26, 118]); // ✅ fixed

    if (tokenData.error) {
      return res.status(401).json({ message: tokenData.message });
    }

    const today = moment().format("YYYY-MM-DD");

    let query = `
      SELECT e.*, g.tourName, g.startDate, g.endDate
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      WHERE e.enquiryProcess = 1
        AND e.nextFollowUp > ?
        AND e.createdBy = ?
    `;
    const params = [today, tokenData.userId];

    // ✅ Filters
    if (req.query.startDate && req.query.endDate) {
      query += " AND g.startDate >= ? AND g.endDate <= ?";
      params.push(req.query.startDate, req.query.endDate);
    } else if (req.query.startDate) {
      query += " AND g.startDate >= ?";
      params.push(req.query.startDate);
    } else if (req.query.endDate) {
      query += " AND g.endDate <= ?";
      params.push(req.query.endDate);
    }

    if (req.query.search) {
      query +=
        " AND CONCAT(COALESCE(e.firstName,''), ' ', COALESCE(e.lastName,'')) LIKE ?";
      params.push(`%${req.query.search}%`);
    }

    if (req.query.tourName) {
      query += " AND g.tourName LIKE ?";
      params.push(`%${req.query.tourName}%`);
    }

    query += " ORDER BY e.nextFollowUp ASC, e.nextFollowUpTime ASC";

    const [rows] = await pool.query(query, params);

    // ✅ Pagination manually
    const perPage = req.query.perPage ? parseInt(req.query.perPage) : 10;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const offset = (page - 1) * perPage;

    const paginated = rows.slice(offset, offset + perPage);

    const data = paginated.map((value) => ({
      enquiryGroupId: value.enquiryGroupId,
      uniqueEnqueryId: String(value.enquiryId).padStart(4, "0"),
      enquiryDate: moment(value.created_at).format("DD-MM-YYYY"),
      groupName: value.groupName,
      guestName: `${value.firstName} ${value.lastName}`,
      contact: value.contact,
      tourName: value.tourName,
      startDate: moment(value.startDate).format("DD-MM-YYYY"),
      endDate: moment(value.endDate).format("DD-MM-YYYY"),
      paxNo: value.adults + value.child,
      lastFollowUp: moment(value.created_at).format("DD-MM-YYYY"),
      remark: value.remark,
      nextFollowUp: moment(value.nextFollowUp).format("DD-MM-YYYY"),
      nextFollowUpTime: value.nextFollowUpTime,
      userName: tokenData.userName,
    }));

    res.json({
      data,
      total: rows.length,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(rows.length / perPage),
    });
  } catch (err) {
    console.error("❌ Upcoming List Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// ---------------- Expired List ----------------
router.get("/expired-list-group-tour", async (req, res) => {
  try {
    const tokenData = await CommonController.checkToken(req.headers["token"], [
      32,
    ]);
    if (tokenData.error) {
      return res.status(401).json(tokenData);
    }

    let { perPage, page, search, tourName, startDate, endDate } = req.query;

    perPage = parseInt(perPage) || 10;
    page = parseInt(page) || 1;
    const offset = (page - 1) * perPage;

    let where = "WHERE 1=1 AND e.nextFollowUp < CURDATE()"; // ✅ expired
    const params = [];

    if (search) {
      where +=
        " AND (e.firstName LIKE ? OR e.lastName LIKE ? OR e.contact LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (tourName) {
      where += " AND g.tourName LIKE ?";
      params.push(`%${tourName}%`);
    }
    if (startDate && endDate) {
      where += " AND g.startDate BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        e.enquiryGroupId,
        LPAD(e.enquiryId, 4, '0') AS uniqueEnqueryId,
        DATE_FORMAT(e.created_at, '%d-%m-%Y') AS enquiryDate,
        e.groupName,
        CONCAT(e.firstName, ' ', e.lastName) AS guestName,
        e.contact,
        e.mail,
        (e.adults + e.child) AS paxNo,
        g.tourName,
        DATE_FORMAT(g.startDate, '%d-%m-%Y') AS startDate,
        DATE_FORMAT(g.endDate, '%d-%m-%Y') AS endDate,
        DATE_FORMAT(e.created_at, '%d-%m-%Y') AS lastFollowUp,
        e.remark,
        DATE_FORMAT(e.nextFollowUp, '%d-%m-%Y') AS nextFollowUp,
        e.nextFollowUpTime,
        ? AS userName
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      ${where}
      ORDER BY e.nextFollowUp DESC
      LIMIT ? OFFSET ?
      `,
      [...params, tokenData.userName, perPage, offset]
    );

    const [count] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM enquirygrouptours e
      JOIN grouptours g ON e.groupTourId = g.groupTourId
      ${where}
      `,
      params
    );

    const total = count[0].total;
    const lastPage = Math.ceil(total / perPage);

    res.json({
      data: rows,
      total,
      currentPage: page,
      perPage,
      lastPage,
    });
  } catch (error) {
    console.error("❌ Expired List Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 Route: GET /group-tour/list-group-tour
// ---------------- LIST GROUP TOUR ----------------
// router.get("/list-group-tour", async (req, res) => {
//   try {
//     // ✅ Token validation
//     const tokenData = await CommonController.checkToken(
//       req.headers["token"],
//       [26, 118]
//     );
//     if (tokenData.error) return res.status(401).json(tokenData);

//     // ✅ Pagination
//     const perPage = parseInt(req.query.perPage) || 10;
//     const page = parseInt(req.query.page) || 1;
//     const offset = (page - 1) * perPage;

//     // ✅ Filters
//     const filters = {
//       tourName: req.query.tourName?.trim() || "",
//       tourType: req.query.tourType?.trim() || "",
//       travelMonth: req.query.travelMonth?.trim() || "",
//       totalDuration: req.query.totalDuration?.trim() || "",
//       travelStartDate: req.query.travelStartDate?.trim() || "",
//       travelEndDate: req.query.travelEndDate?.trim() || "",
//       departureType: req.query.departureType?.trim() || "",
//       cityId: req.query.cityId?.trim() || "",
//     };

//     // ---------------- Base query ----------------
//     let query = `
//       SELECT g.*, t.tourTypeName
//       FROM grouptours g
//       JOIN tourtype t ON g.tourTypeId = t.tourTypeId
//       WHERE 1=1
//     `;
//     const params = [];

//     // Apply filters
//     if (filters.tourName) {
//       query += " AND g.tourName LIKE ?";
//       params.push(`%${filters.tourName}%`);
//     }

//     if (filters.tourType) {
//       query += " AND g.tourTypeId = ?";
//       params.push(filters.tourType);
//     }

//     if (filters.travelMonth) {
//       const month = moment(filters.travelMonth, "YYYY-MM-DD").format("MM");
//       query += " AND MONTH(g.startDate) = ?";
//       params.push(month);
//     }

//     if (filters.totalDuration) {
//       query += " AND CONCAT(g.days,'D-',g.night,'N') LIKE ?";
//       params.push(`%${filters.totalDuration}%`);
//     }

//     if (filters.travelStartDate) {
//       query += " AND g.startDate >= ?";
//       params.push(filters.travelStartDate);
//     }

//     if (filters.travelEndDate) {
//       query += " AND g.endDate <= ?";
//       params.push(filters.travelEndDate);
//     }

//     if (filters.cityId) {
//       query += ` AND g.groupTourId IN (SELECT groupTourId FROM grouptourscity WHERE cityId = ?)`;
//       params.push(filters.cityId);
//     }

//     if (filters.departureType) {
//       query += ` AND g.departureTypeId = ?`;
//       params.push(filters.departureType);
//     }

//     query += " ORDER BY g.created_at DESC";
//     query += " LIMIT ? OFFSET ?";
//     params.push(perPage, offset);

//     // ---------------- Execute query ----------------
//     const [rows] = await db.query(query, params);

//     // Count total rows
//     const [countResult] = await db.query(
//       "SELECT COUNT(*) as total FROM grouptours g"
//     );
//     const total = countResult[0].total;

//     // Map results
//     const data = rows.map((g) => ({
//       groupTourId: g.groupTourId,
//       tourName: g.tourName,
//       tourCode: g.tourCode,
//       tourTypeName: g.tourTypeName,
//       startDate: moment(g.startDate).format("DD-MM-YYYY"),
//       endDate: moment(g.endDate).format("DD-MM-YYYY"),
//       duration: `${g.days}D-${g.night}N`,
//       totalSeats: g.totalSeats,
//       pdfUrl: g.pdfUrl ? `${req.protocol}://${req.get("host")}${g.pdfUrl}` : "",
//       printUrl: g.printUrl
//         ? `${req.protocol}://${req.get("host")}${g.printUrl}`
//         : "",
//     }));

//     return res.status(200).json({
//       message: "Group tours fetched successfully",
//       filters,
//       data,
//       total,
//       perPage,
//       currentPage: page,
//       lastPage: Math.ceil(total / perPage),
//     });
//   } catch (error) {
//     console.error("[/list-group-tour] Error:", error.message);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// Route: GET /list-group-tour
router.get("/list-group-tour", async (req, res) => {
  try {
    const token = req.headers["token"];
    const tokenData = await CommonController.checkToken(token, [26, 118]);

    if (!tokenData) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let {
      startDate,
      endDate,
      search,
      tourName,
      perPage = 10,
      page = 1,
    } = req.query;
    perPage = parseInt(perPage);
    page = parseInt(page);
    const offset = (page - 1) * perPage;

    let baseQuery = `
            SELECT eg.*, gt.tourName, gt.startDate, gt.endDate
            FROM enquirygrouptours eg
            JOIN grouptours gt ON eg.groupTourId = gt.groupTourId
            WHERE eg.enquiryProcess = 1
            AND DATE(eg.nextFollowUp) = CURDATE()
            AND TIME(eg.nextFollowUpTime) > TIME(NOW())
            AND eg.createdBy = ?
        `;

    let queryParams = [tokenData.userId];

    if (startDate && endDate) {
      baseQuery += ` AND gt.startDate >= ? AND gt.endDate <= ? `;
      queryParams.push(startDate, endDate);
    } else if (startDate) {
      baseQuery += ` AND gt.startDate >= ? `;
      queryParams.push(startDate);
    } else if (endDate) {
      baseQuery += ` AND gt.endDate <= ? `;
      queryParams.push(endDate);
    }

    if (search) {
      baseQuery += ` AND CONCAT(eg.firstName, ' ', eg.lastName) LIKE ? `;
      queryParams.push(`%${search}%`);
    }

    if (tourName) {
      baseQuery += ` AND gt.tourName LIKE ? `;
      queryParams.push(`%${tourName}%`);
    }

    baseQuery += ` ORDER BY eg.nextFollowUpTime ASC LIMIT ? OFFSET ? `;
    queryParams.push(perPage, offset);

    const [rows] = await pool.execute(baseQuery, queryParams);

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
      userName: tokenData.userName,
    }));

    // Get total count for pagination
    const [countRows] = await db.execute(
      `SELECT COUNT(*) as total
             FROM enquirygrouptours eg
             JOIN grouptours gt ON eg.groupTourId = gt.groupTourId
             WHERE eg.enquiryProcess = 1
             AND DATE(eg.nextFollowUp) = CURDATE()
             AND TIME(eg.nextFollowUpTime) > TIME(NOW())
             AND eg.createdBy = ?`,
      [tokenData.userId]
    );

    const total = countRows[0].total;

    res.json({
      data: groupTourArray,
      total,
      currentPage: page,
      perPage,
      lastPage: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;

// GET /group-tour-dropdown
router.get("/group-tour-dropdown", async (req, res) => {
  try {
    // Query: select tours whose endDate >= today
    const [groupTours] = await db.execute(
      `SELECT groupTourId, tourName, tourCode, endDate 
             FROM grouptours 
             WHERE endDate >= CURDATE()`
    );

    let groupToursArray = [];

    if (groupTours.length > 0) {
      groupToursArray = groupTours.map((tour) => ({
        groupTourId: tour.groupTourId,
        tourName: `${tour.tourName} (${tour.tourCode})`,
      }));
    }

    return res.status(200).json({ data: groupToursArray });
  } catch (error) {
    console.error("Error fetching group tours:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /priority-list
// GET /priority-list
router.get("/priority-list", async (req, res) => {
  try {
    // Pagination parameters (default page=1, perPage=10)
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Total count for pagination
    const [countResult] = await db.execute(
      "SELECT COUNT(*) as total FROM dropdownpriority"
    );
    const total = countResult[0].total;

    // Fetch paginated data (use template literals for LIMIT/OFFSET)
    const [priorityList] = await db.execute(
      `SELECT priorityId, priorityName FROM dropdownpriority LIMIT ${perPage} OFFSET ${offset}`
    );

    // Map results
    const priorityArray = priorityList.map((item) => ({
      priorityId: item.priorityId,
      priorityName: item.priorityName,
    }));

    return res.status(200).json({
      data: priorityArray,
      currentPage: page,
      perPage: perPage,
      totalPages: Math.ceil(total / perPage),
      totalItems: total,
    });
  } catch (error) {
    console.error("Error fetching priority list:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
// GET /dd-prefix
router.get("/dd-prefix", async (req, res) => {
  try {
    // Fetch all records from dropdownprefix table
    const [ddPrefix] = await db.execute(
      "SELECT preFixId, preFixName FROM dropdownprefix"
    );

    // If no records found, return empty array
    const ddPrefixArray = ddPrefix.length
      ? ddPrefix.map((item) => ({
          preFixId: item.preFixId,
          preFixName: item.preFixName,
        }))
      : [];

    return res.status(200).json({ data: ddPrefixArray });
  } catch (error) {
    console.error("Error fetching dropdown prefix:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /enquiry-reference-list
router.get("/enquiry-reference-list", async (req, res) => {
  try {
    // Pagination parameters (default page=1, perPage=10)
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;

    // Total count for pagination
    const [countResult] = await db.execute(
      "SELECT COUNT(*) as total FROM dropdownenquiryreference"
    );
    const total = countResult[0].total;

    // Fetch paginated data (use template literals for LIMIT/OFFSET)
    const [enquiryReferList] = await db.execute(
      `SELECT enquiryReferId, enquiryReferName 
             FROM dropdownenquiryreference 
             LIMIT ${perPage} OFFSET ${offset}`
    );

    // Map results
    const enquiryReferArray = enquiryReferList.map((item) => ({
      enquiryReferId: item.enquiryReferId,
      enquiryReferName: item.enquiryReferName,
    }));

    return res.status(200).json({
      data: enquiryReferArray,
      currentPage: page,
      perPage: perPage,
      totalPages: Math.ceil(total / perPage),
      totalItems: total,
    });
  } catch (error) {
    console.error("Error fetching enquiry reference list:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /dropdown-guest-ref
router.get("/dropdown-guest-refId", async (req, res) => {
  try {
    // Fetch all users where guestId != 0
    const [guestIds] = await db.execute(
      "SELECT guestId, firstName, lastName FROM users WHERE guestId != 0"
    );

    // Map results to desired format
    const guestArray = guestIds.map((guest) => ({
      guestRefId: guest.guestId,
      firstName: guest.firstName,
      lastName: guest.lastName,
    }));

    return res.status(200).json({ data: guestArray });
  } catch (error) {
    console.error("Error fetching guest reference IDs:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

const GroupTourController = require("../controllers/groupTourController");

router.get(
  "/confirm-group-tour-list",
  GroupTourController.getAllConfirmGroupTourList
);
router.get(
  "/all-confirm-group-tour-list",
  GroupTourController.getAllConfirmGroupTourList
);

// router.get("/upcoming-list-group-tour", GroupTourController.upcomingListGroupTour);

// Confirm custom tour listing
router.get("/confirm-custom-list", GroupTourController.allConfirmCustomList);
router.get(
  "/all-confirm-custom-list",
  GroupTourController.allConfirmCustomList
);

//guest-detail-gt-list
router.get(
  "/guest-detail-gt-list",
  GroupTourController.guestDetailGroupTourList
);

// Departure type listing
router.get(
  "/departure-type-list",
  query("destinationId")
    .notEmpty()
    .withMessage("destinationId is required")
    .bail()
    .isNumeric()
    .withMessage("destinationId must be numeric"),
  async (req, res) => {
    // ✅ Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: errors.array().map((e) => e.msg),
      });
    }

    const { destinationId } = req.query;

    try {
      let sql;
      let params = [];

      if (Number(destinationId) === 1) {
        // Get all departure types
        sql =
          "SELECT departureTypeId, departureName FROM dropdowndeparturetype";
      } else if (Number(destinationId) === 2) {
        // Get only departureTypeId = 2
        sql =
          "SELECT departureTypeId, departureName FROM dropdowndeparturetype WHERE departureTypeId = ?";
        params = [2];
      } else {
        return res.status(200).json({ data: [] });
      }

      const [rows] = await db.query(sql, params);

      const data = rows.map((row) => ({
        departureTypeId: row.departureTypeId,
        departureName: row.departureName,
      }));

      return res.status(200).json({ data });
    } catch (err) {
      console.error("❌ Error fetching departure types:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

//all-guest-detail-gt-list
router.get(
  "/all-guest-detail-gt-list",
  GroupTourController.allGuestDetailGroupTourList
);

//guest-detail-ct-list
router.get(
  "/guest-detail-ct-list",
  GroupTourController.guestDetailCustomTourList
);

//lost enquiries for sales
router.get(
  "/lost-enquiry-group-tour",
  GroupTourController.lostEnquiryGroupTour
);

//all-guest-detail-ct-list
router.get(
  "/all-guest-detail-ct-list",
  GroupTourController.allGuestDetailCustomTourList
);

//booking records
router.get("/booking-records", GroupTourController.bookingRecords);

//booking records customize tour
router.get("/booking-record-ct", GroupTourController.bookingRecordsCt);

//all booking record group tour
router.get("/all-booking-records-gt", GroupTourController.allBookingRecordsGt);

//all-booking-records-ct
router.get("/all-booking-records-ct", GroupTourController.allBookingRecordCt);

//future enquiry all listing
router.get(
  "/future-enquiry-all-listing",
  GroupTourController.futureEnquiryAllListing
);

//self future enquiry listing
router.get(
  "/future-enquiry-self-listing",
  GroupTourController.futureEnquirySelfListing
);

//pending pay list
router.get("/paypending-list", GroupTourController.payPendingList);

router.get("/confirmpay-list", GroupTourController.confirmPayList);

// routes/accCTRoutes.js
//pending payment list
router.get("/pending-pay-list-ct", GroupTourController.pendingPayListCT);

router.get("/confirm-pay-list-ct", GroupTourController.confirmPayListCT);

// routes/customTourRoutes.js
router.get("/lost-enquiry-custom", GroupTourController.lostEnquiryCustomTour);

// routes/roleManagementRoutes.js
router.get("/all-lost-enqs-gt", GroupTourController.allLostEnqsGt);

// all lost enquiry CT
router.get("/all-lost-enqs-ct", GroupTourController.allLostEnqsCt);

// routes/salesRoute.js
// loyalGuestsLists
router.get("/guests-list", GroupTourController.guestsList);

// ✅ add-users with roleId 5
router.post("/add-users", GroupTourController.addUsers);

// all-guests-search
router.get("/all-guests-search", GroupTourController.allGuestSearch);

// all-guests-list
router.get("/all-guests-list", GroupTourController.allGuestsList);

// View users data
router.get("/users-details", GroupTourController.usersDetails);

// Edit users (with role check via token)
router.post("/update-user-data", GroupTourController.updateUserData);

// GET /guests-details?guestId=1&tab=1&page=1&perPage=10
router.get("/guests-details", GroupTourController.guestsDetails);

// top 5 referee no of guests
router.get("/referee-no-of-guests", GroupTourController.refereeNoOfGuests);

// top 5 guests sales received
router.get(
  "/guests-sales-received",
  GroupTourController.allGuestsSalesReceived
);

// loyalty guests
router.get("/loyalty-guests", GroupTourController.loyaltyGuests);

// top 5 referee guests (all)
router.get(
  "/all-referee-no-of-guests",
  GroupTourController.allRefereeNoOfGuests
);

//all top  5 sales received
router.get(
  "/all-guests-sales-received",
  GroupTourController.allGuestsSalesReceived
);

//all-loyalty-guests
router.get("/all-loyalty-guests", GroupTourController.allLoyaltyGuests);

// GET - get edit tour type
router.get("/get-edit-tour-type", GroupTourController.getEditTourType);

//////////////////////////// //review crud ///////////////////
//review crud

router.post("/add-review", GroupTourController.addReview);

// GET - get edit review
router.get("/get-edit-review", GroupTourController.getEditReview);

// POST - edit review
router.post("/edit-review", GroupTourController.editReview);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

router.get(
  "/sales-team-lead-listing",
  GroupTourController.salesTeamLeadListing
);
router.get(
  "/sales-list-team-lead",
  GroupTourController.salesTeamLeadListing
);

////////////////////////////////////////  RoleManagement Controller///////////
router.post(
  "/future-tour-enquiry-details",
  GroupTourController.futureTourEnquiryDetails
);
router.post("/change-status-print", GroupTourController.changeStatusPrint);
router.get(
  "/download-waari-select-report",
  GroupTourController.downloadWaariSelectReport
);
router.post(
  "/add-influencer-affiliate",
  GroupTourController.addInfluencerAffiliate
);
router.get(
  "/delete-influencer-affiliate",
  GroupTourController.deleteInfluencerAffiliate
);

router.post("/add-user", GroupTourController.addUser);
//router.get("/view-users-data", GroupTourController.viewUsersData);
module.exports = router;

