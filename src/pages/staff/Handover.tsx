import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowRight,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface HandoverItem {
  _id: string
  writer: {
    _id: string
    name: string
    username: string
  }
  content: string
  checklist: { item: string; done: boolean }[]
  confirmed: boolean
  confirmedBy: {
    _id: string
    name: string
    username: string
  }[]
  isImportant?: boolean
  createdAt: string
}

const Handover = () => {
  const { toast } = useToast()
  const currentUserId = localStorage.getItem('userId')
  const [handovers, setHandovers] = useState<HandoverItem[]>([])
  const [handoverContent, setHandoverContent] = useState('')
  const [myChecklist, setMyChecklist] = useState([
    { item: '시재 점검', done: false },
    { item: '청소 완료', done: false },
    { item: '재고 보충', done: false },
    { item: '냉장고 온도 체크', done: false },
    { item: '폐기 물품 처리', done: false },
  ])
  const [isImportant, setIsImportant] = useState(false)
  const [isOlderOpen, setIsOlderOpen] = useState(false)

  // Edit State
  const [editingHandover, setEditingHandover] = useState<HandoverItem | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editChecklist, setEditChecklist] = useState<{ item: string; done: boolean }[]>([])
  const [editIsImportant, setEditIsImportant] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Schedule State
  const [todaySchedule, setTodaySchedule] = useState<any>(null)
  const [elapsedTime, setElapsedTime] = useState<string>('근무 없음')

  useEffect(() => {
    fetchHandovers()
    fetchSchedule()
  }, [])

  const fetchSchedule = async () => {
    try {
      const res = await api.get<any[]>('/schedule/my')
      // Get today in YYYY-MM-DD
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const todayStr = `${year}-${month}-${day}`

      const shift = res.data.find((s: any) => s.date === todayStr)
      setTodaySchedule(shift)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!todaySchedule) {
        setElapsedTime('근무 없음')
        return
    }

    const updateTimer = () => {
        const now = new Date()
        const [sh, sm] = todaySchedule.startTime.split(':').map(Number)
        const [eh, em] = todaySchedule.endTime.split(':').map(Number)
        
        const start = new Date()
        start.setHours(sh, sm, 0, 0)
        
        const end = new Date()
        end.setHours(eh, em, 0, 0)
        if (end < start) end.setDate(end.getDate() + 1) // Overnight

        if (now < start) {
            const diff = start.getTime() - now.getTime()
            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            setElapsedTime(`근무 시작 ${hours}시간 ${minutes}분 전`)
        } else if (now > end) {
            setElapsedTime('근무 종료')
        } else {
            const diff = now.getTime() - start.getTime()
            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            setElapsedTime(`${hours}시간 ${minutes}분`)
        }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [todaySchedule])

  const fetchHandovers = async () => {
    try {
      const res = await api.get<HandoverItem[]>('/handovers')
      setHandovers(res.data)
    } catch (error) {
      console.error('Failed to fetch handovers', error)
    }
  }

  const handleEditClick = (handover: HandoverItem) => {
    setEditingHandover(handover)
    setEditContent(handover.content)
    setEditChecklist(JSON.parse(JSON.stringify(handover.checklist))) // Deep copy
    setEditIsImportant(handover.isImportant || false)
    setIsEditOpen(true)
  }

  const handleUpdateHandover = async () => {
    if (!editingHandover) return
    if (!editContent.trim()) {
        toast({ title: '내용을 입력하세요', variant: 'destructive' })
        return
    }

    try {
        await api.put(`/handovers/${editingHandover._id}`, {
            content: editContent,
            checklist: editChecklist,
            isImportant: editIsImportant
        })
        toast({ title: '수정 완료', description: '인수인계가 수정되었습니다.' })
        setIsEditOpen(false)
        setEditingHandover(null)
        fetchHandovers()
    } catch (error) {
        toast({ title: '수정 실패', description: '오류가 발생했습니다.', variant: 'destructive' })
    }
  }

  const toggleEditChecklistItem = (index: number) => {
      const updated = [...editChecklist]
      updated[index].done = !updated[index].done
      setEditChecklist(updated)
  }

  const handleConfirmHandover = async (handoverId: string) => {
    try {
      await api.put(`/handovers/${handoverId}/confirm`)
      toast({
        title: '인수인계 확인 완료',
        description: '이전 근무자의 인수인계를 확인했습니다.',
      })
      fetchHandovers()
    } catch (error) {
      toast({
        title: '오류 발생',
        description: '인수인계 확인 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    }
  }

  const handleSubmitHandover = async () => {
    if (!handoverContent.trim()) {
      toast({
        title: '내용을 입력하세요',
        description: '인수인계 내용을 입력해주세요.',
        variant: 'destructive',
      })
      return
    }

    try {
      await api.post('/handovers', {
        content: handoverContent,
        checklist: myChecklist,
        isImportant,
      })
      toast({
        title: '인수인계 작성 완료',
        description: '다음 근무자에게 전달되었습니다.',
      })
      setHandoverContent('')
      setIsImportant(false)
      setMyChecklist(myChecklist.map((item) => ({ ...item, done: false })))
      fetchHandovers()
    } catch (error) {
      toast({
        title: '오류 발생',
        description: '인수인계 작성 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    }
  }

  const toggleChecklistItem = (index: number) => {
    const updated = [...myChecklist]
    updated[index].done = !updated[index].done
    setMyChecklist(updated)
  }

  const renderHandoverCard = (handover: HandoverItem) => (
    <div
      key={handover._id}
      className={`p-4 border rounded-lg ${
        handover.isImportant
          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
          : 'bg-primary/5'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{handover.writer.name}</p>
            {handover.isImportant && (
              <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
                중요
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(handover.createdAt).toLocaleDateString()} •{' '}
            {new Date(handover.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
            {handover.writer._id === currentUserId && (
                <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => handleEditClick(handover)}>
                    수정
                </Button>
            )}
            {!handover.confirmed ? (
            <Badge variant="outline" className="border-warning text-warning">
                미확인
            </Badge>
            ) : (
            <Badge variant="outline" className="border-success text-success">
                확인됨
            </Badge>
            )}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium mb-2">인수인계 내용:</p>
        <div className="p-3 bg-background rounded text-sm whitespace-pre-line">
          {handover.content}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium mb-2">업무 체크리스트:</p>
        <div className="space-y-2">
          {handover.checklist.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              {item.done ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span
                className={
                  item.done ? 'text-muted-foreground line-through' : ''
                }
              >
                {item.item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {handover.confirmedBy && handover.confirmedBy.length > 0 && (
        <div className="mt-4 p-2 bg-green-100 text-green-800 rounded text-sm font-medium">
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span>확인한 사람:</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {handover.confirmedBy.map((user) => (
              <Badge
                key={user._id}
                variant="secondary"
                className="bg-white/50"
              >
                {user.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {(!handover.confirmedBy ||
        !handover.confirmedBy.some((u) => u._id === currentUserId)) && 
        handover.writer._id !== currentUserId && (
        <Button
          onClick={() => handleConfirmHandover(handover._id)}
          className="w-full mt-2"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          인수인계 확인
        </Button>
      )}
    </div>
  )

  const latestHandover = handovers[0]
  const olderHandovers = handovers.slice(1)

  return (
    <div className="space-y-6">
      {/* ======= 3.b) 업무 인수인계 - 작성 폼, 이전 근무자 확인(확인버튼) ======= */}
      <div>
        <h1 className="text-3xl font-bold">업무 인수인계</h1>
        <p className="text-muted-foreground mt-1">
          이전 근무자의 인수인계를 확인하고 다음 근무자에게 전달하세요
        </p>
      </div>

      {/* 통계 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              미확인 인수인계
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {handovers.filter((h) => !h.confirmed).length}건
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              완료된 체크리스트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {myChecklist.filter((item) => item.done).length}/
              {myChecklist.length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              현재 근무 시간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{elapsedTime}</div>
            {todaySchedule && elapsedTime !== '근무 없음' && elapsedTime !== '근무 종료' && !elapsedTime.includes('전') && (
                <p className="text-xs text-muted-foreground mt-1">
                    {todaySchedule.startTime} ~ {todaySchedule.endTime}
                </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ======= 3.b-1) 전 근무자 인수인계 확인 (인수인계 확인 버튼) ======= */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-primary rotate-180" />전
              근무자 인수인계
            </CardTitle>
            <CardDescription>확인이 필요한 인수인계 내역</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {handovers.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  등록된 인수인계가 없습니다.
                </div>
              )}

              {/* 최신 인수인계 */}
              {latestHandover && renderHandoverCard(latestHandover)}

              {/* 이전 인수인계 (접기/펼치기) */}
              {olderHandovers.length > 0 && (
                <Collapsible
                  open={isOlderOpen}
                  onOpenChange={setIsOlderOpen}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-center">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full">
                        {isOlderOpen ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-2" />
                            이전 인수인계 접기
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-2" />
                            이전 인수인계 더보기 ({olderHandovers.length}건)
                          </>
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-4">
                    {olderHandovers.map((handover) =>
                      renderHandoverCard(handover)
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ======= 3.b-2) 다음 근무자 인수인계 작성 폼 ======= */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-accent" />
                다음 근무자 인수인계
              </CardTitle>
              <CardDescription>
                다음 근무자에게 전달할 내용을 작성하세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">
                  나의 업무 체크리스트:
                </p>
                <div className="space-y-3">
                  {myChecklist.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded transition-colors"
                    >
                      <Checkbox
                        id={`checklist-${index}`}
                        checked={item.done}
                        onCheckedChange={() => toggleChecklistItem(index)}
                      />
                      <label
                        htmlFor={`checklist-${index}`}
                        className={`text-sm cursor-pointer flex-1 ${
                          item.done ? 'line-through text-muted-foreground' : ''
                        }`}
                      >
                        {item.item}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">인수인계 내용 작성:</p>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="important"
                      checked={isImportant}
                      onCheckedChange={(checked) =>
                        setIsImportant(checked as boolean)
                      }
                    />
                    <label
                      htmlFor="important"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-red-500 flex items-center gap-1 cursor-pointer"
                    >
                      <AlertCircle className="w-4 h-4" />
                      중요 사항 포함
                    </label>
                  </div>
                </div>
                <Textarea
                  placeholder="다음 근무자에게 전달할 사항을 입력하세요...&#10;&#10;예시:&#10;• 특이사항이나 주의할 점&#10;• 재고 상황&#10;• 고객 문의 내용&#10;• 기타 업무 관련 사항"
                  value={handoverContent}
                  onChange={(e) => setHandoverContent(e.target.value)}
                  rows={10}
                  className="resize-none"
                />
              </div>

              <Button onClick={handleSubmitHandover} className="w-full">
                인수인계 작성 완료
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-sm">💡 인수인계 작성 팁</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>• 구체적이고 명확하게 작성하세요</p>
              <p>• 긴급하거나 중요한 사항은 맨 위에 작성</p>
              <p>• 미완료 업무는 반드시 명시하세요</p>
              <p>• 고객 문의사항도 함께 전달하면 좋아요</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>인수인계 수정</DialogTitle>
                <DialogDescription>작성한 인수인계 내용을 수정합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div>
                    <p className="text-sm font-medium mb-2">체크리스트:</p>
                    <div className="space-y-2">
                        {editChecklist.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Checkbox 
                                    id={`edit-check-${index}`}
                                    checked={item.done}
                                    onCheckedChange={() => toggleEditChecklistItem(index)}
                                />
                                <label htmlFor={`edit-check-${index}`} className="text-sm cursor-pointer">
                                    {item.item}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">내용:</p>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="edit-important"
                                checked={editIsImportant}
                                onCheckedChange={(c) => setEditIsImportant(c as boolean)}
                            />
                            <label htmlFor="edit-important" className="text-sm text-red-500 flex items-center gap-1 cursor-pointer">
                                <AlertCircle className="w-4 h-4" /> 중요
                            </label>
                        </div>
                    </div>
                    <Textarea 
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={8}
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>취소</Button>
                <Button onClick={handleUpdateHandover}>수정 완료</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Handover
