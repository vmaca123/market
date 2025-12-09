import express from 'express'
import QrLog from '../models/QrLog'
import Product from '../models/Product'

const router = express.Router()

router.post('/save-qr', async (req, res) => {
  try {
    const body = req.body
    console.log('📦 QR 스캔 데이터 수신:', body)

    let realData
    if (body.data && typeof body.data === 'string') {
      try {
        realData = JSON.parse(body.data)
      } catch (e) {
        realData = body
      }
    } else {
      realData = body.data || body
    }

    const { productName, barcode, price, entryDate, expireDate, quantity } =
      realData

    const qtyNum = Number(quantity) || 1
    const priceNum = Number(price) || 0 //
    const targetBarcode = barcode || 'NO_BARCODE'

    if (!productName) {
      return res.status(400).json({ error: '상품명이 없습니다.' })
    }

    const newLog = await QrLog.create({
      productName,
      barcode: targetBarcode,
      price: priceNum,
      entryDate: entryDate || new Date().toISOString(),
      expireDate: expireDate || '',
      quantity: qtyNum,
    })

    if (targetBarcode !== 'NO_BARCODE') {
      const product = await Product.findOne({ barcode: targetBarcode })

      if (product) {
        product.stock += qtyNum

        if (priceNum > 0) {
          product.price = priceNum
          console.log(`💰 가격 업데이트: ${priceNum}원`)
        }

        if (expireDate) {
          const newExpiry = new Date(expireDate)
          const currentExpiry = product.expiryDate
            ? new Date(product.expiryDate)
            : new Date('9999-12-31')
          if (newExpiry < currentExpiry) {
            product.expiryDate = newExpiry
          }
        }

        await product.save()
        console.log(
          `✅ [재고반영] ${productName}: +${qtyNum}개 (현재: ${product.stock}개)`
        )
      } else {
        // 바코드로 못 찾았을 경우, 이름으로 검색 시도
        const existingByName = await Product.findOne({ name: productName })

        if (existingByName) {
          // 이름이 같은 상품이 존재함.
          // 가격이 0원이면 기존 상품 가격 가져오기
          const finalPrice = priceNum > 0 ? priceNum : existingByName.price

          // 기존 상품에 바코드가 없는 경우 -> 바코드 등록 및 재고 합치기
          if (!existingByName.barcode) {
            existingByName.barcode = targetBarcode
            existingByName.stock += qtyNum
            if (priceNum > 0) existingByName.price = priceNum // 가격 정보가 새로 들어왔으면 업데이트

            // 유통기한 업데이트 로직 (기존 로직과 동일하게)
            if (expireDate) {
              const newExpiry = new Date(expireDate)
              const currentExpiry = existingByName.expiryDate
                ? new Date(existingByName.expiryDate)
                : new Date('9999-12-31')
              if (newExpiry < currentExpiry) {
                existingByName.expiryDate = newExpiry
              }
            }

            await existingByName.save()
            console.log(
              `🔗 [바코드연동] ${productName}: 바코드 등록 및 재고 합산`
            )
          } else {
            // 기존 상품에 바코드가 이미 있음 (다른 바코드) -> 새로운 상품으로 등록하되 정보 복사
            console.log(`✨ [신규등록-유사] ${productName} (기존 정보 참고)`)
            await Product.create({
              name: productName,
              barcode: targetBarcode,
              price: finalPrice, // 기존 상품 가격 사용
              stock: qtyNum,
              category: existingByName.category || '기타', // 카테고리도 복사
              minStock: existingByName.minStock || 5,
              expiryDate: expireDate ? new Date(expireDate) : undefined,
            })
          }
        } else {
          console.log(`✨ [신규등록] ${productName} (가격: ${priceNum}원)`)
          await Product.create({
            name: productName,
            barcode: targetBarcode,
            price: priceNum,
            stock: qtyNum,
            category: '기타',
            minStock: 5,
            expiryDate: expireDate ? new Date(expireDate) : undefined,
          })
        }
      }
    }

    return res
      .status(200)
      .json({ message: '입고 및 가격 반영 성공', result: newLog })
  } catch (error) {
    console.error('서버 에러:', error)
    return res.status(500).json({ error: '저장 실패' })
  }
})

router.get('/get-qr', async (req, res) => {
  try {
    const logs = await QrLog.find().sort({ scannedAt: -1 })
    res.json(logs)
  } catch (error) {
    res.status(500).json({ error: '데이터 불러오기 실패' })
  }
})

router.delete('/delete-qr/:id', async (req, res) => {
  try {
    const { id } = req.params
    await QrLog.findByIdAndDelete(id)
    res.json({ message: '삭제 성공' })
  } catch (error) {
    res.status(500).json({ error: '삭제 실패' })
  }
})

export default router
