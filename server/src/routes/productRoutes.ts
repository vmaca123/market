import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import Product from '../models/Product'

const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q, category } = req.query

    const filter: Record<string, any> = {
      $and: [
        { name: { $exists: true } },
        { name: { $ne: '' } },
        { name: { $ne: '이름 없음' } },
        { name: { $ne: null } },
      ],
    }

    if (category && category !== '전체') {
      filter.category = category
    }

    if (q) {
      filter.name = { $regex: q as string, $options: 'i' }
    }

    const products = await Product.find(filter).sort({ createdAt: -1 })
    res.json(products)
  } catch (err) {
    console.error('상품 목록 로드 에러:', err)
    res.status(500).json({ message: '상품 목록 로드 실패' })
  }
})

// 재고 증감 (발주 승인 시 사용)
router.patch('/:id/stock', authMiddleware, async (req, res) => {
  try {
    const { quantity } = req.body
    const delta = Number(quantity)

    if (!Number.isFinite(delta) || delta <= 0) {
      return res.status(400).json({ message: '유효한 수량을 입력하세요.' })
    }

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ message: '상품을 찾을 수 없습니다.' })
    }

    product.stock += delta
    await product.save()

    res.json(product)
  } catch (err) {
    console.error('재고 업데이트 에러:', err)
    res.status(500).json({ message: '재고 업데이트 실패' })
  }
})

// 상품 정보 수정 (재고, 유통기한 등)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { quantity, expiryDate } = req.body
    const updateData: any = {}

    if (quantity !== undefined) {
      updateData.stock = Number(quantity)
    }
    if (expiryDate !== undefined) {
      updateData.expiryDate = expiryDate
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    )

    if (!product) {
      return res.status(404).json({ message: '상품을 찾을 수 없습니다.' })
    }

    res.json(product)
  } catch (err) {
    console.error('상품 업데이트 에러:', err)
    res.status(500).json({ message: '상품 업데이트 실패' })
  }
})

// 상품 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id)
    if (!product) {
      return res.status(404).json({ message: '상품을 찾을 수 없습니다.' })
    }
    res.json({ message: '상품이 삭제되었습니다.' })
  } catch (err) {
    console.error('상품 삭제 에러:', err)
    res.status(500).json({ message: '상품 삭제 실패' })
  }
})

export default router
