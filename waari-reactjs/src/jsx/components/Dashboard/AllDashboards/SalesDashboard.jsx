import React, { useContext, useEffect, useState } from "react";
import Table from "../../table/VTable";
//Import Components
import { ThemeContext } from "../../../../context/ThemeContext";
import DualLine from "../charts/dualLine";
import Bar3 from "../charts/bar3";
import { CircularProgressbar } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { get } from "../../../../services/apiServices";
import { useSelector } from "react-redux";
import { hasComponentPermission } from "../../../auth/PrivateRoute";
import { Link } from "react-router-dom";

const DASHBOARD_MOCKS = {
	birthdays: [
		{
			familyHeadName: "Amit Sharma",
			dob: "1990-12-27",
			marriageDate: "2016-02-14",
			contact: "+91 98230 12345",
		},
		{
			familyHeadName: "Priya Patel",
			dob: "1988-01-09",
			marriageDate: "2014-11-22",
			contact: "+91 98765 44110",
		},
	],
	followups: {
		gt: [
			{
				uniqueEnqueryId: "0012",
				nextFollowUp: "27-12-2025",
				nextFollowUpTime: "10:00 AM",
				groupName: "Goa Delight",
				paxNo: 4,
				userName: "Sales Admin",
			},
			{
				uniqueEnqueryId: "0040",
				nextFollowUp: "28-12-2025",
				nextFollowUpTime: "03:30 PM",
				groupName: "Himalayan Escape",
				paxNo: 6,
				userName: "Meena Kale",
			},
		],
		ct: [
			{
				uniqueEnqueryId: "0081",
				nextFollowUp: "27-12-2025",
				nextFollowUpTime: "12:15 PM",
				groupName: "Maldives Honeymoon",
				pax: 2,
				userName: "Neeraj Joshi",
			},
			{
				uniqueEnqueryId: "0095",
				nextFollowUp: "29-12-2025",
				nextFollowUpTime: "05:45 PM",
				groupName: "Europe Explorer",
				pax: 3,
				userName: "Sales Admin",
			},
		],
	},
	metrics: {
		loyaltyBooking: 9,
		welcomeBooking: 4,
		referralRate: 37,
		nextRankCount: 5,
		topTenRankCount: 8,
		topFiveRankCount: 3,
		currentBookingCount: 42,
	},
	topSalesPartners: [
		{
			userName: "Anita Rao",
			domesticCountGt: 8,
			internationalCountGt: 3,
			total_count_gt: 11,
			domesticCountCt: 5,
			internationalCountCt: 2,
			total_count_ct: 7,
			total_count_overall: 18,
			todaysBooking: 1,
		},
		{
			userName: "Rahul Deshmukh",
			domesticCountGt: 6,
			internationalCountGt: 2,
			total_count_gt: 8,
			domesticCountCt: 4,
			internationalCountCt: 1,
			total_count_ct: 5,
			total_count_overall: 13,
			todaysBooking: 0,
		},
		{
			userName: "Maya Fernandes",
			domesticCountGt: 5,
			internationalCountGt: 4,
			total_count_gt: 9,
			domesticCountCt: 3,
			internationalCountCt: 2,
			total_count_ct: 5,
			total_count_overall: 14,
			todaysBooking: 2,
		},
		{
			userName: "Arjun Patel",
			domesticCountGt: 4,
			internationalCountGt: 1,
			total_count_gt: 5,
			domesticCountCt: 2,
			internationalCountCt: 1,
			total_count_ct: 3,
			total_count_overall: 8,
			todaysBooking: 0,
		},
		{
			userName: "Sneha Kulkarni",
			domesticCountGt: 3,
			internationalCountGt: 2,
			total_count_gt: 5,
			domesticCountCt: 2,
			internationalCountCt: 1,
			total_count_ct: 3,
			total_count_overall: 8,
			todaysBooking: 1,
		},
	],
	targets: {
		gt: {
			monthly: { total: 85, achieved: 62, remaining: 23 },
			quarterly: { total: 240, achieved: 180, remaining: 60 },
			yearly: { total: 960, achieved: 710, remaining: 250 },
		},
		ct: {
			monthly: { total: 65, achieved: 44, remaining: 21 },
			quarterly: { total: 180, achieved: 126, remaining: 54 },
			yearly: { total: 720, achieved: 510, remaining: 210 },
		},
	},
	gtGraph: {
		target: [0, 45, 50, 55, 60, 65, 70, 72, 74, 78, 80, 82, 85],
		achieve: [0, 38, 44, 48, 52, 58, 63, 66, 69, 71, 74, 77, 80],
		barTotals: [12, 14, 16, 18, 15, 17, 19, 20, 22, 18, 16, 14],
		barConfirmed: [8, 9, 11, 12, 10, 11, 13, 14, 15, 12, 11, 9],
		barLost: [2, 2, 2, 3, 2, 3, 3, 3, 4, 3, 2, 2],
		table: [
			{
				previousMonthTotal: 12,
				currentMonthTotal: 15,
				ongoing: 4,
				confirmed: 9,
				lost: 2,
				conversionRate: 60,
			},
		],
	},
	ctGraph: {
		target: [0, 30, 34, 36, 38, 42, 45, 47, 49, 50, 52, 54, 55],
		achieve: [0, 24, 26, 28, 31, 34, 37, 39, 41, 42, 44, 45, 47],
		barTotals: [6, 7, 8, 9, 8, 9, 10, 11, 12, 10, 9, 8],
		barConfirmed: [4, 4, 5, 6, 5, 6, 7, 8, 8, 7, 6, 5],
		barLost: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
		table: [
			{
				previousMonthTotal: 7,
				currentMonthTotal: 9,
				ongoing: 2,
				confirmed: 6,
				lost: 1,
				conversionRate: 66,
			},
		],
	},
};

const applyArrayFallback = (value, fallback) => {
	if (Array.isArray(value) && value.length) {
		return value;
	}
	return fallback;
};

const applyNumberFallback = (value, fallback) => {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return fallback;
	}
	return Number(value);
};

const calculateProgressPercentage = (
	currentBookings,
	bookingsNeededForNextRank
) => {
	const progressPercentage =
		(currentBookings * bookingsNeededForNextRank) / 100;
	return progressPercentage;
};

const Home = () => {
	const { permissions } = useSelector((state) => state.auth);

	const [isLoading, setIsLoading] = useState(false);

	const [guestsWithDOB, setGuestsWithDOB] = useState([]);
	const [isTableLoading, setIsTableLoading] = useState(false);
	const [totalCount, setTotalCount] = useState(0);
	const [perPageItem, setPerPageItem] = useState(10);
	const [page, setPage] = React.useState(1);

	const [loyaltyBooking, setLoyaltyBooking] = useState(null);
	const [welcomeBooking, setWelcomeBooking] = useState(null);
	const [refferalRate, setRefferalRate] = useState(null);

	const [top5SalesPartner, setTop5SalesPartner] = useState(null);
	const [nextRankCount, setNextRankCount] = useState(null);
	const [topTenRankCount, setTopTenRankCount] = useState(null);
	const [topFiveRankCount, setTopFiveRankCount] = useState(null);
	const [currentBookingCount, setCurrentBookingCount] = useState(null);

	// Group Tour Related States
	const [gtGraphArray, setGtGraphArray] = useState([]);
	const [gtAchieveArray, setGtAchieveArray] = useState([]);

	const [monthlyTargetGt, setMonthlyTargetGt] = useState(null);
	const [quarterlyTargetGt, setQuarterlyTargetGt] = useState(null);
	const [yearlyTargetGt, setYearlyTargetGt] = useState(null);

	const [achieveMonthlyTargetGt, setAchieveMonthlyTargetGt] = useState(null);
	const [achieveQuarterTargetGt, setAchieveQuarterTargetGt] = useState(null);
	const [achieveYearTargetGt, setAchieveYearTargetGt] = useState(null);

	const [remainingMonthlyTargetGt, setRemainingMonthlyTargetGt] =
		useState(null);
	const [remainingQuarterTargetGt, setRemainingQuarterTargetGt] =
		useState(null);
	const [remainingYearTargetGt, setRemainingYearTargetGt] = useState(null);

	const [enquiriesGT, setEnquiriesGT] = useState([]);

	const [totalEnquiriesGt, setTotalEnquiriesGt] = useState([]);
	const [confirmedEnquiriesGt, setConfirmedEnquiriesGt] = useState([]);
	const [lostEnquiriesGt, setLostEnquiriesGt] = useState([]);

	// Cusomized Tour Related States
	const [ctGraphArray, setCtGraphArray] = useState([]);
	const [ctAchieveArray, setCtAchieveArray] = useState([]);

	const [monthlyTargetCt, setMonthlyTargetCt] = useState(null);
	const [quarterlyTargetCt, setQuarterlyTargetCt] = useState(null);
	const [yearlyTargetCt, setYearlyTargetCt] = useState(null);

	const [achieveMonthlyTargetCt, setAchieveMonthlyTargetCt] = useState(null);
	const [achieveQuarterTargetCt, setAchieveQuarterTargetCt] = useState(null);
	const [achieveYearTargetCt, setAchieveYearTargetCt] = useState(null);

	const [remainingMonthlyTargetCt, setRemainingMonthlyTargetCt] =
		useState(null);
	const [remainingQuarterTargetCt, setRemainingQuarterTargetCt] =
		useState(null);
	const [remainingYearTargetCt, setRemainingYearTargetCt] = useState(null);

	const [enquiriesCT, setEnquiriesCT] = useState([]);

	const [totalEnquiriesCt, setTotalEnquiriesCt] = useState([]);
	const [confirmedEnquiriesCt, setConfirmedEnquiriesCt] = useState([]);
	const [lostEnquiriesCt, setLostEnquiriesCt] = useState([]);

	const [isFollowsLoading, setIsFollowsLoading] = useState(false);
	const [todaysGTFolloups, setTodaysGTFolloups] = useState([])
	const [todaysCTFolloups, setTodaysCTFolloups] = useState([])

	const { gt: fallbackGtTargets, ct: fallbackCtTargets } = DASHBOARD_MOCKS.targets;

	const displayBirthdays = applyArrayFallback(guestsWithDOB, DASHBOARD_MOCKS.birthdays);
	const displayGTFollowups = applyArrayFallback(
		todaysGTFolloups,
		DASHBOARD_MOCKS.followups.gt
	);
	const displayCTFollowups = applyArrayFallback(
		todaysCTFolloups,
		DASHBOARD_MOCKS.followups.ct
	);

	const displayLoyaltyBooking = applyNumberFallback(
		loyaltyBooking,
		DASHBOARD_MOCKS.metrics.loyaltyBooking
	);
	const displayWelcomeBooking = applyNumberFallback(
		welcomeBooking,
		DASHBOARD_MOCKS.metrics.welcomeBooking
	);
	const displayReferralRate = applyNumberFallback(
		refferalRate,
		DASHBOARD_MOCKS.metrics.referralRate
	);
	const displayNextRankCount = applyNumberFallback(
		nextRankCount,
		DASHBOARD_MOCKS.metrics.nextRankCount
	);
	const displayTopTenRankCount = applyNumberFallback(
		topTenRankCount,
		DASHBOARD_MOCKS.metrics.topTenRankCount
	);
	const displayTopFiveRankCount = applyNumberFallback(
		topFiveRankCount,
		DASHBOARD_MOCKS.metrics.topFiveRankCount
	);
	const displayCurrentBookingCount = applyNumberFallback(
		currentBookingCount,
		DASHBOARD_MOCKS.metrics.currentBookingCount
	);

	const displayGtTargetArray = applyArrayFallback(
		gtGraphArray,
		DASHBOARD_MOCKS.gtGraph.target
	);
	const displayGtAchieveArray = applyArrayFallback(
		gtAchieveArray,
		DASHBOARD_MOCKS.gtGraph.achieve
	);
	const displayGtTotalEnquiries = applyArrayFallback(
		totalEnquiriesGt,
		DASHBOARD_MOCKS.gtGraph.barTotals
	);
	const displayGtConfirmedEnquiries = applyArrayFallback(
		confirmedEnquiriesGt,
		DASHBOARD_MOCKS.gtGraph.barConfirmed
	);
	const displayGtLostEnquiries = applyArrayFallback(
		lostEnquiriesGt,
		DASHBOARD_MOCKS.gtGraph.barLost
	);
	const displayGtTableData = applyArrayFallback(
		enquiriesGT,
		DASHBOARD_MOCKS.gtGraph.table
	);

	const displayCtTargetArray = applyArrayFallback(
		ctGraphArray,
		DASHBOARD_MOCKS.ctGraph.target
	);
	const displayCtAchieveArray = applyArrayFallback(
		ctAchieveArray,
		DASHBOARD_MOCKS.ctGraph.achieve
	);
	const displayCtTotalEnquiries = applyArrayFallback(
		totalEnquiriesCt,
		DASHBOARD_MOCKS.ctGraph.barTotals
	);
	const displayCtConfirmedEnquiries = applyArrayFallback(
		confirmedEnquiriesCt,
		DASHBOARD_MOCKS.ctGraph.barConfirmed
	);
	const displayCtLostEnquiries = applyArrayFallback(
		lostEnquiriesCt,
		DASHBOARD_MOCKS.ctGraph.barLost
	);
	const displayCtTableData = applyArrayFallback(
		enquiriesCT,
		DASHBOARD_MOCKS.ctGraph.table
	);

	const displayTopSalesPartners = applyArrayFallback(
		top5SalesPartner,
		DASHBOARD_MOCKS.topSalesPartners
	);

	const displayMonthlyTargetGt = applyNumberFallback(
		monthlyTargetGt,
		fallbackGtTargets.monthly.total
	);
	const displayQuarterlyTargetGt = applyNumberFallback(
		quarterlyTargetGt,
		fallbackGtTargets.quarterly.total
	);
	const displayYearlyTargetGt = applyNumberFallback(
		yearlyTargetGt,
		fallbackGtTargets.yearly.total
	);
	const displayAchieveMonthlyTargetGt = applyNumberFallback(
		achieveMonthlyTargetGt,
		fallbackGtTargets.monthly.achieved
	);
	const displayAchieveQuarterTargetGt = applyNumberFallback(
		achieveQuarterTargetGt,
		fallbackGtTargets.quarterly.achieved
	);
	const displayAchieveYearTargetGt = applyNumberFallback(
		achieveYearTargetGt,
		fallbackGtTargets.yearly.achieved
	);
	const displayRemainingMonthlyTargetGt = applyNumberFallback(
		remainingMonthlyTargetGt,
		fallbackGtTargets.monthly.remaining
	);
	const displayRemainingQuarterTargetGt = applyNumberFallback(
		remainingQuarterTargetGt,
		fallbackGtTargets.quarterly.remaining
	);
	const displayRemainingYearTargetGt = applyNumberFallback(
		remainingYearTargetGt,
		fallbackGtTargets.yearly.remaining
	);

	const displayMonthlyTargetCt = applyNumberFallback(
		monthlyTargetCt,
		fallbackCtTargets.monthly.total
	);
	const displayQuarterlyTargetCt = applyNumberFallback(
		quarterlyTargetCt,
		fallbackCtTargets.quarterly.total
	);
	const displayYearlyTargetCt = applyNumberFallback(
		yearlyTargetCt,
		fallbackCtTargets.yearly.total
	);
	const displayAchieveMonthlyTargetCt = applyNumberFallback(
		achieveMonthlyTargetCt,
		fallbackCtTargets.monthly.achieved
	);
	const displayAchieveQuarterTargetCt = applyNumberFallback(
		achieveQuarterTargetCt,
		fallbackCtTargets.quarterly.achieved
	);
	const displayAchieveYearTargetCt = applyNumberFallback(
		achieveYearTargetCt,
		fallbackCtTargets.yearly.achieved
	);
	const displayRemainingMonthlyTargetCt = applyNumberFallback(
		remainingMonthlyTargetCt,
		fallbackCtTargets.monthly.remaining
	);
	const displayRemainingQuarterTargetCt = applyNumberFallback(
		remainingQuarterTargetCt,
		fallbackCtTargets.quarterly.remaining
	);
	const displayRemainingYearTargetCt = applyNumberFallback(
		remainingYearTargetCt,
		fallbackCtTargets.yearly.remaining
	);

	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleRowsPerPageChange = (perPage) => {
		setPerPageItem(perPage);
		setPage(1);
	};

	//get birthday and annivasary data
	const getBirthDayData = async () => {
		try {
			setIsTableLoading(true);
			const result = await get(
				`/billing/birthday-lists?page=${page}&perPage=${perPageItem}`
			);

			setTotalCount(result.data.lastPage);
			setGuestsWithDOB(result.data.guestsWithDOB);
		} catch (error) {
			console.log(error);
		} finally {
			setIsTableLoading(false);
		}
	};

	// for particular sales enquiries todays followups 
	const todaysFollowUpGT = async () => {
		try {
			setIsFollowsLoading(true);
			const response = await get(
				`/list-group-tour?perPage=10&page=1`
			);
			setTodaysGTFolloups(response?.data?.data);
			setIsFollowsLoading(false);

		} catch (error) {
			setIsFollowsLoading(false);
			console.log(error);
		}
	};

	const todaysFollowUpCT = async () => {
		try {
			setIsFollowsLoading(true);
			const response = await get(
				`/billing/enquiry-follow-custom?perPage=10&page=1`
			);
			setTodaysCTFolloups(response?.data?.data);
			setIsFollowsLoading(false);

		} catch (error) {
			setIsFollowsLoading(false);
			console.log(error);
		}
	};


	useEffect(() => {
		if (!permissions?.length) return;
		hasComponentPermission(permissions, 26) && todaysFollowUpGT();
		hasComponentPermission(permissions, 32) && todaysFollowUpCT();
	}, [permissions]);


	//get loyalty booking
	const getLoyaltyBooking = async () => {
		try {
			const result = await get(`/billing/loyalty-booking`);

			setLoyaltyBooking(result.data.loyaltyBooking);
		} catch (error) {
			console.log(error);
		}
	};

	//get welcome booking
	const getWelcomeBooking = async () => {
		try {
			const result = await get(`/billing/welcome-booking`);

			setWelcomeBooking(result.data.welcomeBooking);
		} catch (error) {
			console.log(error);
		}
	};

	//get refferal rate
	const getRefferalRate = async () => {
		try {
			const result = await get(`/billing/referral-rate`);

			setRefferalRate(result.data.referralRate);
		} catch (error) {
			console.log(error);
		}
	};

	//get more booking counts like nextRankCount, currentBookingCount, topTenRankCount, topFiveRankCount
	const getMoreBookingCount = async () => {
		try {
			const result = await get(`/billing/more-booking-count`);

			setNextRankCount(result.data.nextRankCount);
			setTopTenRankCount(result.data.topTenRankCount);
			setTopFiveRankCount(result.data.topFiveRankCount);
			setCurrentBookingCount(result.data.currentBookingCount);
		} catch (error) {
			console.log(error);
		}
	};

	//get top 5 sales partner data
	const getTop5SalesPartnerData = async () => {
		try {
			const result = await get(`/billing/top-sales-partner`);
			setTop5SalesPartner(result.data?.topSales);
		} catch (error) {
			console.log(error);
		}
	};

	// Group Tour Related Data like graphs counts Apis
	//get monthly target graph for group tour
	const getMonthlyTargetGraphGt = async () => {
		try {
			const result = await get(`/billing/monthly-target-graph-gt`);
			setGtGraphArray(result.data.gtGraphArray);
			setGtAchieveArray(result.data.gtAchieveArray);
		} catch (error) {
			console.log(error);
		}
	};

	//get Group Tour Target Counts
	const getGroupTourTargets = async () => {
		try {
			const result = await get(`/billing/target-gt`);
			setMonthlyTargetGt(result.data.monthlyTarget);
			setQuarterlyTargetGt(result.data.quarterlyTarget);
			setYearlyTargetGt(result.data.yearlyTarget);

			setAchieveMonthlyTargetGt(result.data.achieveMonthlyTargetGt);
			setAchieveQuarterTargetGt(result.data.achieveQuarterTargetGt);
			setAchieveYearTargetGt(result.data.achieveYearTargetGt);

			setRemainingMonthlyTargetGt(result.data.remainingMonthlyTargetGt);
			setRemainingQuarterTargetGt(result.data.remainingQuarterTargetGt);
			setRemainingYearTargetGt(result.data.remainingYearTargetGt);
		} catch (error) {
			console.log(error);
		}
	};

	//get enquiry list gt
	const getEnquiriesGT = async () => {
		try {
			const result = await get(`/billing/enquiry-list-gt`);
			setEnquiriesGT(result.data?.enquiriesGT);
		} catch (error) {
			console.log(error);
		}
	};

	//get enquiry graph gt
	const getEnquiryGraphGt = async () => {
		try {
			const result = await get(`/billing/enquiry-graph-gt`);
			setTotalEnquiriesGt(result.data?.totalEnquiriesGt);
			setConfirmedEnquiriesGt(result.data?.confirmedEnquiriesGt);
			setLostEnquiriesGt(result.data?.lostEnquiriesGt);
		} catch (error) {
			console.log(error);
		}
	};

	// Customized Tour Related Data like graphs counts Apis
	//get monthly target graph for customized tour
	const getMonthlyTargetGraphCt = async () => {
		try {
			const result = await get(`/billing/monthly-target-graph-ct`);
			setCtGraphArray(result.data.ctTargetArray);
			setCtAchieveArray(result.data.ctAchieveArray);
		} catch (error) {
			console.log(error);
		}
	};

	//get Custom Tour Target Counts
	const getCustomTourTargets = async () => {
		try {
			const result = await get(`/billing/target-ct`);
			setMonthlyTargetCt(result.data.monthlyTarget);
			setQuarterlyTargetCt(result.data.quarterlyTarget);
			setYearlyTargetCt(result.data.yearlyTarget);

			setAchieveMonthlyTargetCt(result.data.achieveMonthlyTargetCt);
			setAchieveQuarterTargetCt(result.data.achieveQuarterTargetCt);
			setAchieveYearTargetCt(result.data.achieveYearTargetCt);

			setRemainingMonthlyTargetCt(result.data.remainingMonthlyTargetCt);
			setRemainingQuarterTargetCt(result.data.remainingQuarterTargetCt);
			setRemainingYearTargetCt(result.data.remainingYearTargetCt);
		} catch (error) {
			console.log(error);
		}
	};

	//get enquiry list ct
	const getEnquiriesCT = async () => {
		try {
			const result = await get(`/billing/enquiry-list-ct`);
			setEnquiriesCT(result.data?.enquiriesCt);
		} catch (error) {
			console.log(error);
		}
	};

	//get enquiry graph ct
	const getEnquiryGraphCt = async () => {
		try {
			const result = await get(`/billing/enquiry-graph-ct`);
			setTotalEnquiriesCt(result.data?.totalEnquiriesCt);
			setConfirmedEnquiriesCt(result.data?.confirmedEnquiriesCt);
			setLostEnquiriesCt(result.data?.lostEnquiriesCt);
		} catch (error) {
			console.log(error);
		}
	};

	const columns = [
		{
			title: "Previous Month",
			dataIndex: "previousMonthTotal",
			key: "previousMonthTotal",
			width: 100,
		},
		{
			title: "Current Month",
			dataIndex: "currentMonthTotal",
			key: "currentMonthTotal",
			width: 100,
		},
		{
			title: "On going",
			dataIndex: "ongoing",
			key: "ongoing",
			width: 100,
		},
		{
			title: "Confirm",
			dataIndex: "confirmed",
			key: "confirmed",
			width: 100,
		},
		{
			title: "Lost",
			dataIndex: "lost",
			key: "lost",
			width: 100,
		},

		{
			title: "Conversion Rate(%)",
			dataIndex: "conversionRate",
			key: "conversionRate",
			width: 100,
		},
	];
	const columns_ct = [
		{
			title: "Previous Month",
			dataIndex: "previousMonthTotal",
			key: "previousMonthTotal",
			width: 100,
		},
		{
			title: "Current Month",
			dataIndex: "currentMonthTotal",
			key: "currentMonthTotal",
			width: 100,
		},
		{
			title: "On going",
			dataIndex: "ongoing",
			key: "ongoing",
			width: 100,
		},
		{
			title: "Confirm",
			dataIndex: "confirmed",
			key: "confirmed",
			width: 100,
		},
		{
			title: "Lost",
			dataIndex: "lost",
			key: "lost",
			width: 100,
		},
		// {
		//   title: "Total",
		//   dataIndex: "total",
		//   key: "total",
		//   width: 100,
		// },
		{
			title: "Conversion Rate(%)",
			dataIndex: "conversionRate",
			key: "conversionRate",
			width: 100,
		},
	];

	const birthday = [
		{
			title: "Name",
			dataIndex: "familyHeadName",
			key: "familyHeadName",
			width: 100,
		},
		{
			title: "Birthday",
			dataIndex: "dob",
			key: "dob",
			width: 100,
		},
		{
			title: "Annivasary",
			dataIndex: "marriageDate",
			key: "marriageDate",
			width: 100,
		},
		{
			title: "Phone No.",
			dataIndex: "contact",
			key: "contact",
			width: 100,
		},
	];

	const todaysFollowupColumnsGT = [
		{
			title: "Enquiry Id",
			dataIndex: "uniqueEnqueryId",
			key: "uniqueEnqueryId",
			width: 40,
		},


		{
			title: "Follow up Date",
			dataIndex: "nextFollowUp",
			width: 50,
			sortable: true,
		},
		{
			title: "Follow up Time",
			dataIndex: "nextFollowUpTime",
			width: 50,
			sortable: true,
		},
		{
			title: "Group Name",
			dataIndex: "groupName",
			key: "groupName",
			width: 120,
			sortable: true,
		},


		{
			title: "Pax",
			dataIndex: "paxNo",
			key: "pax",
			width: 90,
		},
		{
			title: "Allocated To",
			dataIndex: "userName",
			key: "userName",
			width: 90,
		},

	];

	const todaysFollowupColumnsCT = [
		{
			title: "Enquiry Id",
			dataIndex: "uniqueEnqueryId",
			key: "uniqueEnqueryId",
			width: 40,
		},
		{
			title: "Follow up Date",
			dataIndex: "nextFollowUp",
			width: 50,
			sortable: true,
		},
		{
			title: "Follow up Time",
			dataIndex: "nextFollowUpTime",
			width: 50,
			sortable: true,
		},
		{
			title: "Group Name",
			dataIndex: "groupName",
			key: "groupName",
			width: 120,
			sortable: true,
		},
		{
			title: "Pax",
			dataIndex: "pax",
			key: "pax",
			width: 80,
		},

		{
			title: "Allocated To",
			dataIndex: "userName",
			key: "userName",
			width: 90,
		},

	]

	const { changeBackground } = useContext(ThemeContext);

	useEffect(() => {
		changeBackground({ value: "light", label: "Light" });
	}, []);

	useEffect(() => {
		if (!permissions?.length) return;
		hasComponentPermission(permissions, 11) && getBirthDayData();
	}, [permissions, page, perPageItem]);

	useEffect(() => {
		if (!permissions?.length) return;
		hasComponentPermission(permissions, 1) && getLoyaltyBooking();

		hasComponentPermission(permissions, 2) && getWelcomeBooking();

		hasComponentPermission(permissions, 3) && getRefferalRate();

		hasComponentPermission(permissions, 21) && getMoreBookingCount();

		// Grout Tour Graphs and list related Api Calls
		hasComponentPermission(permissions, 12) && getMonthlyTargetGraphGt();

		hasComponentPermission(permissions, 14) && getGroupTourTargets();

		hasComponentPermission(permissions, 16) && getEnquiryGraphGt();

		hasComponentPermission(permissions, 18) && getEnquiriesGT();

		// Custmized Tour Graphs and list related Api Calls
		hasComponentPermission(permissions, 13) && getMonthlyTargetGraphCt();

		hasComponentPermission(permissions, 15) && getCustomTourTargets();

		hasComponentPermission(permissions, 17) && getEnquiryGraphCt();

		hasComponentPermission(permissions, 19) && getEnquiriesCT();
	}, [permissions]);

	useEffect(() => {
		if (!permissions?.length) return;
		hasComponentPermission(permissions, 20) && getTop5SalesPartnerData();
	}, [permissions]);

	useEffect(() => {
		// While view farmer page is active, the yadi tab must also activated
		let element = document.getElementById("Dashboard");
		if (element) {
			element.classList.add("mm-active1"); // Add the 'active' class to the element
		}
		return () => {
			if (element) {
				element.classList.remove("mm-active1"); // remove the 'active' class to the element when change to another page
			}
		};
	}, []);

	return (
		<>
			<div className="row ">
				{hasComponentPermission(permissions, 11) ? (
					<div className="col-lg-6 col-sm-12">
						<div className="card bg-yellow">
							<div className="card-body ">
								<div className="card-header" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Birthday</div>
								</div>
								<div className="mt-3 mb-3 birthday-table">
									<Table
										cols={birthday}
										data={displayBirthdays}
										totalPages={totalCount}
										isTableLoading={isTableLoading}
										handlePageChange={handlePageChange}
										isPagination={true}
										handleRowsPerPageChange={handleRowsPerPageChange}
									/>
								</div>
							</div>
						</div>
					</div>
				) : (
					""
				)}
				{hasComponentPermission(permissions, 26) ? (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body ">
								<div className="card-header" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Group Tour Today's Followups</div>
								</div>
								<div className="mt-3 mb-3 birt`hday-table">
									<Table
										cols={todaysFollowupColumnsGT}
										data={displayGTFollowups}
										isTableLoading={isFollowsLoading}
										isPagination={false}
									/>
								</div>
							</div>
						</div>
					</div>
				) : (
					""
				)}
				{hasComponentPermission(permissions, 32) ? (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body ">
								<div className="card-header" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Custom Tour Today's Followups</div>
								</div>
								<div className="mt-3 mb-3 birt`hday-table">
									<Table
										cols={todaysFollowupColumnsCT}
										data={displayCTFollowups}
										isTableLoading={isFollowsLoading}
										isPagination={false}
									/>
								</div>
							</div>
						</div>
					</div>
				) : (
					""
				)}
				<div className="col-lg-6 col-sm-12">
					<div className="row">
						{hasComponentPermission(permissions, 1) && (
							<div className="col-xl-6 col-md-6 col-lg-6 col-12">
								<div className="card booking">
									<div className="card-body">
										<div className="booking-status d-flex align-items-center">
											<div className="ms-4">
												<p className="mb-0 text-nowrap">Loyalty Booking</p>
												<h2 className="mb-0 font-w600">
													{displayLoyaltyBooking}
												</h2>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}
						{hasComponentPermission(permissions, 2) && (
							<div className="col-xl-6 col-md-6 col-lg-6 col-12">
								<div className="card booking">
									<div className="card-body">
										<div className="booking-status d-flex align-items-center">
											<div className="ms-4">
												<p className="mb-0 text-nowrap ">Welcome Booking</p>
												<h2 className="mb-0 font-w600">
													{displayWelcomeBooking}
												</h2>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}

						{hasComponentPermission(permissions, 3) && (
							<div className="col-xl-6 col-md-6 col-lg-6 col-sm-6">
								<div className="card booking">
									<div className="card-body">
										<div className="booking-status d-flex text-center align-items-center">
											<div className="ms-4">
												<p className="mb-0">Referral Rate</p>
												<h2 className="mb-0 font-w600">{displayReferralRate}</h2>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}
						{/* <div className="col-xl-2 col-md-4 col-lg-3 col-sm-6">
          <div className="card booking">
            <div className="card-body">
              <div className="booking-status d-flex  align-items-center">
              <div className="ms-4">
                <p className="mb-0">Card sold</p>
                  <h2 className="mb-0 font-w600">516</h2>
                 </div>
   
              </div>
            </div>
          </div>
        </div> */}
					</div>
				</div>
			</div>
			<div className="row">
				<div className="col-lg-12 col-sm-12">
					{(hasComponentPermission(permissions, 12) ||
						hasComponentPermission(permissions, 14) ||
						hasComponentPermission(permissions, 16) ||
						hasComponentPermission(permissions, 18)) && (
							<div className="card">
								<div className="card-body">
									<div
										className="card-header"
										style={{ paddingLeft: "0", paddingTop: "0" }}
									>
										<div className="card-title h2">Group Tour</div>
									</div>
								</div>
							</div>
						)}
				</div>

				{hasComponentPermission(permissions, 12) && (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body">
								<div className="card-header pt-0" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Monthly Target</div>
								</div>
								<DualLine
									achivedTarget={displayGtAchieveArray}
									actualTarget={displayGtTargetArray}
								/>
							</div>
						</div>
					</div>
				)}
				{hasComponentPermission(permissions, 16) ||
					hasComponentPermission(permissions, 18) ? (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body">
								<div
									className="card-header"
									style={{ paddingLeft: "0", paddingTop: "0" }}
								>
									<div className="card-title h5">Enquiries</div>
								</div>

								{hasComponentPermission(permissions, 16) && (
									<Bar3
										confirmEnqData={displayGtConfirmedEnquiries}
										lostEnqData={displayGtLostEnquiries}
										totalEnqData={displayGtTotalEnquiries}
									/>
								)}

								{hasComponentPermission(permissions, 18) && (
									<div className="mt-3">
										<Table
											cols={columns}
											page={1}
											data={displayGtTableData}
											totalPages={1}
											isTableLoading={isLoading}
										/>
									</div>
								)}
							</div>
						</div>
					</div>
				) : (
					""
				)}
				{hasComponentPermission(permissions, 14) && (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body">
								<div className="card-header pt-0" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Target</div>
								</div>
								<div className="row mt-2 mb-2">
									<div
										className="col-lg-4 col-sm-4 col-6  m-auto  d-flex justify-content-center text-center purple-progress"
										style={{ flexDirection: "column" }}
									>
										<CircularProgressbar
											value={displayMonthlyTargetGt}
											text={`Total-${displayMonthlyTargetGt}`}
										/>
										<h6 className="mt-2">Monthly Target</h6>
										<div className="heading-card">
											<h6>Achieved:{displayAchieveMonthlyTargetGt}</h6>
											<h6>Remaining:{displayRemainingMonthlyTargetGt}</h6>
										</div>
									</div>
									<div
										className="col-lg-4 col-sm-4 col-6 m-auto  d-flex justify-content-center text-center yellow-progress"
										style={{ flexDirection: "column" }}
									>
										<CircularProgressbar
											value={displayQuarterlyTargetGt}
											text={`Total-${displayQuarterlyTargetGt}`}
										/>
										<h6 className="mt-2">Quarter Target</h6>
										<div className="heading-card1">
											<h6>Achieved:{displayAchieveQuarterTargetGt}</h6>
											<h6>Remaining:{displayRemainingQuarterTargetGt}</h6>
										</div>
									</div>
									<div
										className="col-lg-4 col-sm-4 col-6 m-auto  d-flex justify-content-center text-center blue-progress"
										style={{ flexDirection: "column" }}
									>
										<CircularProgressbar
											value={displayYearlyTargetGt}
											text={`Total-${displayYearlyTargetGt}`}
										/>
										<h6 className="mt-2">Yearly Target</h6>
										<div className="heading-card2">
											<h6>Achieved:{displayAchieveYearTargetGt}</h6>
											<h6>Remaining:{displayRemainingYearTargetGt}</h6>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}
				{/* Customised */}
				<div className="col-lg-12 col-sm-12">
					{(hasComponentPermission(permissions, 13) ||
						hasComponentPermission(permissions, 15) ||
						hasComponentPermission(permissions, 17) ||
						hasComponentPermission(permissions, 19)) && (
							<div className="card">
								<div className="card-body">
									<div
										className="card-header"
										style={{ paddingLeft: "0", paddingTop: "0" }}
									>
										<div className="card-title h2">Customized Tour</div>
									</div>
								</div>
							</div>
						)}
				</div>
				{hasComponentPermission(permissions, 13) && (
					<div className="col-lg-6 col-sm-12">

						<div className="card">
							<div className="card-body">
								<div className="card-header pt-0" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Monthly Target</div>
								</div>
								<DualLine
									achivedTarget={displayCtAchieveArray}
									actualTarget={displayCtTargetArray}
								/>
							</div>
						</div>

					</div>
				)}
				{hasComponentPermission(permissions, 17) ||
					hasComponentPermission(permissions, 19) ? (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body">
								<div
									className="card-header"
									style={{ paddingLeft: "0", paddingTop: "0" }}
								>
									<div className="card-title h5">Enquiries</div>
								</div>

								{hasComponentPermission(permissions, 17) && (
									<Bar3
										confirmEnqData={displayCtConfirmedEnquiries}
										lostEnqData={displayCtLostEnquiries}
										totalEnqData={displayCtTotalEnquiries}
									/>
								)}

								{hasComponentPermission(permissions, 19) && (
									<div className="mt-3">
										<Table
											cols={columns_ct}
											page={1}
											data={displayCtTableData}
											totalPages={1}
											isTableLoading={isLoading}
										/>
									</div>
								)}
							</div>
						</div>
					</div>
				) : (
					""
				)}
				{hasComponentPermission(permissions, 15) && (
					<div className="col-lg-6 col-sm-12">
						<div className="card">
							<div className="card-body">
								<div className="card-header pt-0" style={{ paddingLeft: "0" }}>
									<div className="card-title h5">Target</div>
								</div>
								<div className="row mt-2 mb-2">
									<div
										className="col-lg-4 col-sm-4 col-6 m-auto d-flex justify-content-center text-center purple-progress"
										style={{ flexDirection: "column" }}
									>
										{/* <Pie4 /> */}
										<CircularProgressbar
											value={displayMonthlyTargetCt}
											text={`Total-${displayMonthlyTargetCt}`}
										/>
										<h6 className="mt-2">Monthly Target</h6>
										<div className="heading-card">
											<h6>Achieved:{displayAchieveMonthlyTargetCt}</h6>
											<h6>Remaining:{displayRemainingMonthlyTargetCt}</h6>
										</div>
									</div>
									<div
										className="col-lg-4 col-sm-4 col-6 m-auto  d-flex justify-content-center text-center yellow-progress"
										style={{ flexDirection: "column" }}
									>
										{/* <Pie5 /> */}
										<CircularProgressbar
											value={displayQuarterlyTargetCt}
											text={`Total-${displayQuarterlyTargetCt}`}
										/>
										<h6 className="mt-2">Quarter Target</h6>
										<div className="heading-card1">
											<h6>Achieved:{displayAchieveQuarterTargetCt}</h6>
											<h6>Remaining:{displayRemainingQuarterTargetCt}</h6>
										</div>
									</div>
									<div
										className="col-lg-4 col-sm-4 col-6 m-auto  d-flex justify-content-center text-center blue-progress"
										style={{ flexDirection: "column" }}
									>
										{/* <Pie6 /> */}
										<CircularProgressbar
											value={displayYearlyTargetCt}
											text={`Total-${displayYearlyTargetCt}`}
										/>
										<h6 className="mt-2">Yearly Target</h6>
										<div className="heading-card2">
											<h6>Achieved:{displayAchieveYearTargetCt}</h6>
											<h6>Remaining:{displayRemainingYearTargetCt}</h6>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}



				{hasComponentPermission(permissions, 20) && (
					<div className="col-md-12">
						<div className="card">
							<div className="card-body">
								<div
									className="card-header"
									style={{ paddingLeft: "0", paddingTop: "0" }}
								>
									<div className="card-title h5">Top 5 Sales Partners </div>
								</div>
								<div className="table-responsive mb-3 mt-3">
									<table className="table  table-bordered table-responsive-sm table-tour table-tour1 table-tour2">
										<thead>
											<tr>
												<th className="" style={{ width: "180px" }}>
													Name
												</th>
												<th className="" colSpan="3" style={{ width: "100px" }}>
													FIT
												</th>
												<th className="" colSpan="3" style={{ width: "100px" }}>
													GIT
												</th>
												<th className="" style={{ width: "120px" }}>
													Overall Total
												</th>
												<th className="" style={{ width: "120px" }}>
													Today New Booking
												</th>
											</tr>
										</thead>

										<tbody className="divide-y divide-gray-600">
											<tr>
												<td></td>
												<td>
													<b>Domestic</b>
												</td>
												<td>
													<b>International</b>
												</td>
												<td>
													<b>Total</b>
												</td>
												<td>
													<b>Domestic</b>
												</td>
												<td>
													<b>International</b>
												</td>
												<td>
													<b>Total</b>
												</td>
												<td></td>
												<td></td>
											</tr>
											{
												displayTopSalesPartners.map((item, index) => (
													<tr key={item.userName + index}>
														<td>{item.userName}</td>
														<td>{item.domesticCountGt}</td>
														<td>{item.internationalCountGt}</td>
														<td>{item.total_count_gt}</td>
														<td>{item.domesticCountCt}</td>
														<td>{item.internationalCountCt}</td>
														<td>{item.total_count_ct}</td>
														<td>{item.total_count_overall}</td>
														<td>{item?.todaysBooking || 0}</td>
													</tr>
												))}
											{
												!displayTopSalesPartners.length && (
													<tr>
														<td colSpan={9}>Data not found</td>
													</tr>
												)}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{hasComponentPermission(permissions, 21) && (
				<div className="row">
					<div className="col-lg-3 col-sm-6">
						<div className="card bg-card">
							<div className="card-body">
								<div className="d-flex align-items-end pb-2 justify-content-between">
									<span className="fs-20 font-w500 text-white">
										More Bookings for Top 10
									</span>
									<span className="fs-22 font-w600 text-white">
										<span className="pe-2"></span>
										{displayTopTenRankCount}
									</span>
								</div>
								{displayTopTenRankCount ? (
									<div className="progress default-progress h-auto">
										<div
											className="progress-bar bg-white progress-animated"
											style={{
												width: `${calculateProgressPercentage(
													displayCurrentBookingCount,
													displayTopTenRankCount
												)}%`,
												height: "13px",
											}}
										>
											<span className="sr-only">
												{calculateProgressPercentage(
													displayCurrentBookingCount,
													displayTopTenRankCount
												)}
												% Complete
											</span>
										</div>
									</div>
								) : (
									<div style={{ textTransform: 'capitalize', color: "#ffc504", fontWeight: "600" }}>You are in top 10</div>
								)}
							</div>
						</div>
					</div>
					<div className="col-lg-3 col-sm-6">
						<div className="card bg-card">
							<div className="card-body">
								<div className="d-flex align-items-end pb-4 justify-content-between">
									<span className="fs-20 font-w500 text-white">
										More Bookings to (next rank)
									</span>
									<span className="fs-22 font-w600 text-white">
										<span className="pe-2"></span>
										{displayNextRankCount}
									</span>
								</div>
								<div className="progress default-progress h-auto">
									<div
										className="progress-bar bg-white progress-animated"
										style={{
											width: `${calculateProgressPercentage(
												displayCurrentBookingCount,
												displayNextRankCount
											)}%`,
											height: "13px",
										}}
									>
										<span className="sr-only">
											{calculateProgressPercentage(
												displayCurrentBookingCount,
												displayNextRankCount
											)}
											% Complete
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="col-lg-3 col-sm-6">
						<div className="card bg-card">
							<div className="card-body">
								<div className="d-flex align-items-end pb-4 justify-content-between">
									<span className="fs-20 font-w500 text-white">
										More Bookings for Top 5
									</span>
									<span className="fs-22 font-w600 text-white">
										<span className="pe-2"></span>
										{displayTopFiveRankCount}
									</span>
								</div>
								{displayTopFiveRankCount ? (
									<div className="progress default-progress h-auto">
										<div
											className="progress-bar bg-white progress-animated"
											style={{
												width: `${calculateProgressPercentage(
													displayCurrentBookingCount,
													displayTopFiveRankCount
												)}%`,
												height: "13px",
											}}
										>
											<span className="sr-only">
												{calculateProgressPercentage(
													displayCurrentBookingCount,
													displayTopFiveRankCount
												)}
												% Complete
											</span>
										</div>
									</div>
								) : (
									<div className="text-white">You are in top 5</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
			{/* {
        top5SalesPartner && top5SalesPartner?.isFirst &&
        <div className="row mb-3">
          <div className="col-md-12 m-auto">
            <div className="card ">
              <div className="card-body text-center body-trophy">
                <img src="assets/images/trophy.png" alt="trophy" className="mx-auto" style={{ width: "6%" }} />
                <h4 className="mb-0">Congratulation!!</h4>
                <p className="mb-0">Your at Top 1st</p>
              </div>
            </div>
          </div>
        </div>
      } */}
		</>
	);
};
export default Home;
