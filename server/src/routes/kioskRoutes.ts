import express from 'express'
import mongoose from 'mongoose'
import Product from '../models/Product'
import Order from '../models/Order'

const router = express.Router()

// 1. 상품 바코드 스캔 (조회)
router.get('/scan/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params
    const product = await Product.findOne({ barcode })

    if (!product) {
      return res.status(404).json({ message: '상품을 찾을 수 없습니다.' })
    }
    res.json(product)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: '서버 에러 발생' })
  }
})

// 2. 결제 처리 및 주문 저장
router.post('/checkout', async (req, res) => {
  try {
    const { items, totalAmount, paymentMethod } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '구매할 상품이 없습니다.' })
    }

    // 1) 요청 상품에 대한 재고 검증을 먼저 수행해 부족하면 바로 차단
    const aggregated: Record<
      string,
      { product: any; qty: number; name: string; barcode?: string }
    > = {}

    for (const raw of items) {
      const qty = Number(raw.quantity) || 0
      if (qty <= 0) continue

      let product = null
      if (raw.productId && mongoose.Types.ObjectId.isValid(raw.productId)) {
        product = await Product.findById(raw.productId)
      }
      if (!product && raw.barcode) {
        product = await Product.findOne({ barcode: raw.barcode })
      }

      if (!product) {
        return res.status(404).json({
          message: '상품을 찾을 수 없습니다.',
          item: raw.name ?? raw.barcode ?? '알 수 없음',
        })
      }

      const key = product._id.toString()
      if (!aggregated[key]) {
        aggregated[key] = {
          product,
          qty,
          name: product.name ?? raw.name ?? '상품',
          barcode: product.barcode ?? raw.barcode,
        }
      } else {
        aggregated[key].qty += qty
      }
    }

    // 재고 부족 여부 확인
    for (const { product, qty, name, barcode } of Object.values(aggregated)) {
      if (product.stock < qty) {
        return res.status(400).json({
          message: '재고가 부족합니다.',
          product: name,
          barcode,
          available: product.stock,
          requested: qty,
        })
      }
    }

    // 2) 재고 차감
    for (const { product, qty } of Object.values(aggregated)) {
      product.stock = Math.max(0, product.stock - qty)
      await product.save()
      console.log(`✅ 재고 차감: ${product.name} (-${qty})`)
    }

    // 재고 차감 로직
    // (위에서 선검증 했으므로 여기서는 성공 로그만 남김)

    // 주문 기록 저장
    const newOrder = await Order.create({
      orderNumber: `ORD-${Date.now()}`,
      items: items.map((item: any) => ({
        productId: mongoose.Types.ObjectId.isValid(item.productId)
          ? item.productId
          : null,
        productName: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      totalAmount,
      paymentMethod,
    })

    res.status(200).json({ success: true, order: newOrder })
  } catch (error) {
    console.error('결제 에러:', error)
    res.status(500).json({ message: '결제 처리에 실패했습니다.' })
  }
})

router.get('/products/quick', async (req, res) => {
  try {
    const products = await Product.find({}).sort({ stock: -1 })
    res.json(products)
  } catch (error) {
    res.status(500).json({ message: '목록 조회 실패' })
  }
})

router.post('/init-data', async (req, res) => {
  try {
    await Product.deleteMany({})

    const initialItems = [
      {
        name: '아이스 아메리카노',
        price: 1500,
        barcode: '880001',
        category: '커피',
        stock: 100,
      },
      {
        name: '핫 아메리카노',
        price: 1200,
        barcode: '880002',
        category: '커피',
        stock: 100,
      },
      {
        name: '생수 500ml',
        price: 900,
        barcode: '880003',
        category: '음료',
        stock: 50,
      },
      {
        name: '비닐봉투',
        price: 20,
        barcode: '880004',
        category: '기타',
        stock: 1000,
      },
      {
        name: '신라면 컵',
        price: 1100,
        barcode: '880005',
        category: '식품',
        stock: 30,
      },
    ]

    await Product.insertMany(initialItems)
    res.json({ message: '초기 상품 데이터 등록 완료!' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: '등록 실패' })
  }
})

export default router
