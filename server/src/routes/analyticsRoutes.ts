import express from 'express'
import Order from '../models/Order'
import { authMiddleware } from '../middleware/auth'

const router = express.Router()

router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay()
    ) // 이번 주 일요일부터
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)

    // 1. 시간대별 매출 (오늘 기준)
    const hourlyStats = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          sales: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ])

    const formattedHourly = Array.from({ length: 17 }, (_, i) => {
      const hour = i + 6 // 06시부터 시작
      const found = hourlyStats.find((h) => h._id === hour)
      return {
        hour: `${String(hour).padStart(2, '0')}:00`,
        sales: found ? found.sales : 0,
      }
    })

    // 2. 요일별 매출 (이번 주)
    const weeklyStats = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfWeek } } },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          sales: { $sum: '$totalAmount' },
        },
      },
    ])

    const daysMap = ['일', '월', '화', '수', '목', '금', '토']
    const formattedWeekly = daysMap.map((day, idx) => {
      const found = weeklyStats.find((w) => w._id === idx + 1)
      return { day, sales: found ? found.sales : 0 }
    })

    // 3. 월별 매출 (올해)
    const monthlyStats = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfYear } } },
      {
        $group: {
          _id: { $month: '$createdAt' },
          sales: { $sum: '$totalAmount' },
        },
      },
    ])

    const formattedMonthly = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyStats.find((m) => m._id === i + 1)
      return {
        month: `${i + 1}월`,
        sales: found ? found.sales : 0,
      }
    })

    // 4. 인기/비인기 상품 분석 (전체 데이터 기준)
    const productStats = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productName',
          sales: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { sales: -1 } },
    ])

    const popularProducts = productStats.slice(0, 5).map((p) => ({
      name: p._id,
      sales: p.sales,
      revenue: p.revenue,
    }))

    const unpopularProducts = productStats
      .filter((p) => p.sales > 0)
      .slice(-5)
      .reverse()
      .map((p) => ({
        name: p._id,
        sales: p.sales,
        revenue: p.revenue,
      }))

    // 5. 요약 통계: 이번 주 매출 + 이번 달 판매 수량
    const totalSales = formattedWeekly.reduce((acc, cur) => acc + cur.sales, 0)

    // 이번 달 판매 수량만 집계
    const monthlyItems = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          totalQty: { $sum: '$items.quantity' },
        },
      },
    ])
    const totalItems =
      monthlyItems.length > 0 && typeof monthlyItems[0].totalQty === 'number'
        ? monthlyItems[0].totalQty
        : 0

    res.json({
      hourlySales: formattedHourly,
      weeklySales: formattedWeekly,
      monthlySales: formattedMonthly,
      popularProducts,
      unpopularProducts,
      summary: {
        totalSales,
        totalItems,
      },
    })
  } catch (error) {
    console.error('Analytics Error:', error)
    res.status(500).json({ message: '데이터 분석 실패' })
  }
})

export default router
