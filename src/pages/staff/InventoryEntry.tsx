import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Search, Package, AlertTriangle, QrCode, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import QrScanner from '@/components/QrScanner'
import api from '@/lib/api'
import axios from 'axios'

type Product = {
  _id: string
  productName: string
  entryDate: string
  expireDate: string
  quantity: number
  scannedAt?: string
  category?: string
  minStock?: number
  price?: number
}

const isExpired = (date?: string) => {
  if (!date) return false
  const target = new Date(date)
  if (isNaN(target.getTime())) return false
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return target < todayStart
}

// [자동 계산] 상품 종류별 유통기한 자동 계산 로직
const getAutoExpiryDate = (productName: string, category: string) => {
  const today = new Date()
  let addDays = 180 // 기본값 (라면/일반식품 등)

  const name = productName.toLowerCase()
  const cat = category || '기타'

  if (cat === '식품') {
    if (
      name.includes('삼각') ||
      name.includes('김밥') ||
      name.includes('도시락') ||
      name.includes('샌드위치') ||
      name.includes('버거')
    ) {
      addDays = 3 // 신선식품
    } else if (name.includes('우유') || name.includes('유제품')) {
      addDays = 10 // 유제품
    } else if (name.includes('빵') || name.includes('케이크')) {
      addDays = 7 // 베이커리
    } else if (name.includes('라면') || name.includes('면')) {
      addDays = 180 // 라면류
    }
  } else if (cat === '음료') {
    addDays = 180 // 음료
  } else if (cat === '생활용품') {
    addDays = 365 * 2 // 생활용품 (2년)
  }

  const targetDate = new Date(today.setDate(today.getDate() + addDays))
  return targetDate.toISOString().split('T')[0]
}

// 데모용 모의 데이터
const MOCK_PRODUCTS: Product[] = [
  {
    _id: 'mock_1',
    productName: '코카콜라 제로',
    entryDate: new Date().toISOString(),
    expireDate: '2024-12-31',
    quantity: 50,
    category: '음료',
    minStock: 10,
    price: 1500,
  },
  {
    _id: 'mock_2',
    productName: '삼각김밥 참치마요',
    entryDate: new Date().toISOString(),
    expireDate: new Date(Date.now() + 86400000 * 2).toISOString(),
    quantity: 2,
    category: '식품',
    minStock: 5,
    price: 1200,
  },
]

const InventoryManagement = () => {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('전체')
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  // QR 입력 상태
  const [qrOpen, setQrOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [qrData, setQrData] = useState({
    barcode: '',
    productName: '',
    quantity: 1,
    price: 0,
    expireDate: '',
  })

  const fetchInventory = async () => {
    setLoading(true)

    const token = localStorage.getItem('token')
    if (!token) {
      setItems(MOCK_PRODUCTS)
      toast({
        title: '데모 모드',
        description: '로그인이 필요합니다. 테스트 데이터를 표시합니다.',
      })
      setLoading(false)
      return
    }

    try {
      const res = await api.get('/products')

      if (!Array.isArray(res.data)) {
        setItems([])
        return
      }

      // 데이터 매핑 및 기본값 처리
      const mapped = res.data.map((item: any) => {
        const expired = isExpired(item.expiryDate)
        return {
          _id: item._id,
          productName: item.name || item.productName || '',
          quantity: expired ? 0 : Number(item.stock) || 0, // 유통기한 지난 상품은 0으로 표시
          category: item.category || '기타',
          price: Number(item.price) || 0,
          minStock: Number(item.minStock) || 5,
          expireDate: item.expiryDate || '',
          entryDate: item.createdAt || new Date().toISOString(),
        }
      })

      const validItems = mapped.filter((item: Product) => {
        const name = item.productName.trim()
        if (!name || name === '이름 없음') return false
        if (item.price === 0 && item.quantity === 0) return false
        return true
      })

      setItems(validItems)
    } catch (err: any) {
      console.warn('API Error:', err.message)

      let errorMsg = '목록 로드 실패'
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) errorMsg = '인증 만료'
        else if (err.code === 'ERR_NETWORK') errorMsg = '서버 연결 불가'
      }

      toast({
        title: '로드 실패',
        description: errorMsg,
        variant: 'destructive',
      })
      setItems(MOCK_PRODUCTS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  const handleScan = (decodedText: string) => {
    try {
      const parsed = JSON.parse(decodedText)
      if (parsed.productId || parsed.productName) {
        // 유통기한 자동 계산 로직 추가
        let finalExpireDate = parsed.expireDate
        if (!finalExpireDate) {
          // 기존 재고에서 카테고리 찾기
          const existingItem = items.find(
            (i) =>
              i._id === parsed.productId || i.productName === parsed.productName
          )
          const category = existingItem?.category || '기타'
          finalExpireDate = getAutoExpiryDate(
            parsed.productName || '',
            category
          )
        }

        setQrData((prev) => ({
          ...prev,
          barcode: parsed.productId || prev.barcode,
          productName: parsed.productName || prev.productName,
          quantity: parsed.quantity || prev.quantity,
          expireDate: finalExpireDate,
        }))
        setScanning(false)
        toast({
          title: '스캔 성공',
          description: 'QR 코드가 인식되었습니다. (유통기한 자동 입력)',
        })
      } else {
        throw new Error('Invalid format')
      }
    } catch (e) {
      setQrData((prev) => ({ ...prev, barcode: decodedText }))
      setScanning(false)
      toast({
        title: '스캔 성공',
        description: '바코드가 인식되었습니다.',
      })
    }
  }

  const handleQrSubmit = async () => {
    if (!qrData.productName || !qrData.quantity) {
      toast({
        title: '입력 오류',
        description: '상품명과 수량은 필수입니다.',
        variant: 'destructive',
      })
      return
    }

    try {
      await api.post('/save-qr', {
        data: JSON.stringify(qrData),
      })

      toast({
        title: '입고 완료',
        description: `${qrData.productName} ${qrData.quantity}개가 입고되었습니다.`,
      })
      setQrOpen(false)
      setQrData({
        barcode: '',
        productName: '',
        quantity: 1,
        price: 0,
        expireDate: '',
      })
      fetchInventory() // 목록 갱신
    } catch (err) {
      console.error(err)
      toast({
        title: '입고 실패',
        description: '서버 오류가 발생했습니다.',
        variant: 'destructive',
      })
    }
  }

  // 검색 및 카테고리 필터링
  const filteredInventory = useMemo(() => {
    return items.filter((item) => {
      const nameMatch = item.productName
        ? item.productName.toLowerCase().includes(searchTerm.toLowerCase())
        : false
      const categoryMatch =
        selectedCategory === '전체' || item.category === selectedCategory
      return nameMatch && categoryMatch
    })
  }, [items, searchTerm, selectedCategory])

  // 유통기한 D-Day 계산
  const daysUntil = (date?: string) => {
    if (!date) return null
    const target = new Date(date).getTime()
    if (isNaN(target)) return null
    const today = new Date().setHours(0, 0, 0, 0)
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
  }

  const lowStockItems = filteredInventory.filter(
    (item) => item.quantity < (item.minStock ?? 0)
  )
  const expiringItems = filteredInventory.filter((item) => {
    const d = daysUntil(item.expireDate)
    return d !== null && d <= 7
  })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">재고 관리</h1>
            <p className="text-muted-foreground mt-1">재고 현황을 확인하세요</p>
          </div>
          <Dialog
            open={qrOpen}
            onOpenChange={(open) => {
              setQrOpen(open)
              if (open) setScanning(true)
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <QrCode className="w-4 h-4" /> QR 입고 스캔
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>QR 입고</DialogTitle>
                <DialogDescription>
                  {scanning
                    ? '카메라로 QR 코드를 스캔하세요.'
                    : '입고 정보를 확인하고 수정하세요.'}
                </DialogDescription>
              </DialogHeader>

              {scanning ? (
                <QrScanner
                  onScan={handleScan}
                  onClose={() => setScanning(false)}
                />
              ) : (
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="barcode" className="text-right">
                      바코드
                    </Label>
                    <Input
                      id="barcode"
                      value={qrData.barcode}
                      onChange={(e) =>
                        setQrData({ ...qrData, barcode: e.target.value })
                      }
                      className="col-span-3"
                      placeholder="스캔된 바코드 번호"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      상품명
                    </Label>
                    <Input
                      id="name"
                      value={qrData.productName}
                      onChange={(e) =>
                        setQrData({ ...qrData, productName: e.target.value })
                      }
                      className="col-span-3"
                      placeholder="예: 신라면"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="qty" className="text-right">
                      수량
                    </Label>
                    <Input
                      id="qty"
                      type="number"
                      value={qrData.quantity}
                      onChange={(e) =>
                        setQrData({
                          ...qrData,
                          quantity: Number(e.target.value),
                        })
                      }
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="price" className="text-right">
                      가격
                    </Label>
                    <Input
                      id="price"
                      type="number"
                      value={qrData.price}
                      onChange={(e) =>
                        setQrData({ ...qrData, price: Number(e.target.value) })
                      }
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="expiry" className="text-right">
                      유통기한
                    </Label>
                    <Input
                      id="expiry"
                      type="date"
                      value={qrData.expireDate}
                      onChange={(e) =>
                        setQrData({ ...qrData, expireDate: e.target.value })
                      }
                      className="col-span-3"
                    />
                  </div>
                </div>
              )}

              {!scanning && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setScanning(true)}>
                    다시 스캔
                  </Button>
                  <Button onClick={handleQrSubmit}>입고 처리</Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">재고 목록</TabsTrigger>
          <TabsTrigger value="expiring">유통기한 임박</TabsTrigger>
        </TabsList>

        {/* 재고 목록 탭 */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="물품 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                <SelectItem value="식품">식품</SelectItem>
                <SelectItem value="음료">음료</SelectItem>
                <SelectItem value="생활용품">생활용품</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={fetchInventory}
              disabled={loading}
            >
              {loading ? '로딩 중...' : '새로고침'}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-warning">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" /> 재고 부족
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {lowStockItems.length}개
                </div>
              </CardContent>
            </Card>
            <Card className="border-destructive">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" /> 임박
                  상품
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {expiringItems.length}개
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>재고 목록</CardTitle>
              <CardDescription>
                전체 {filteredInventory.length}개 품목
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredInventory.map((item) => {
                  const expiry = daysUntil(item.expireDate)
                  return (
                    <div
                      key={item._id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Package className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{item.productName}</h4>
                          <p className="text-sm text-muted-foreground">
                            {item.category} • ₩
                            {item.price?.toLocaleString() ?? '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">재고</p>
                          <p
                            className={`font-medium ${
                              item.quantity < (item.minStock ?? 0)
                                ? 'text-warning'
                                : ''
                            }`}
                          >
                            {item.quantity}개
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            유통기한
                          </p>
                          <p
                            className={`font-medium ${
                              expiry !== null && expiry <= 3
                                ? 'text-destructive'
                                : ''
                            }`}
                          >
                            {expiry === null ? '-' : `D-${expiry}`}
                          </p>
                        </div>
                        {item.quantity < (item.minStock ?? 0) && (
                          <Badge
                            variant="outline"
                            className="border-warning text-warning"
                          >
                            부족
                          </Badge>
                        )}
                        {expiry !== null && expiry <= 3 && (
                          <Badge
                            variant="outline"
                            className="border-destructive text-destructive"
                          >
                            임박
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
                {filteredInventory.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    등록된 재고가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 유통기한 임박 탭 */}
        <TabsContent value="expiring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>유통기한 임박 상품</CardTitle>
              <CardDescription>7일 이내 만료 예정</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expiringItems.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between p-4 border border-destructive/20 bg-destructive/5 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <div>
                        <h4 className="font-medium">{item.productName}</h4>
                        <p className="text-sm text-muted-foreground">
                          재고: {item.quantity}개
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant="outline"
                        className="border-destructive text-destructive"
                      >
                        {daysUntil(item.expireDate) !== null
                          ? `D-${daysUntil(item.expireDate)}`
                          : '-'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default InventoryManagement
