'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Calendar as CalendarIcon, Clock, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'

type MyShiftStatus = 'completed' | 'today' | 'off' | 'upcoming'

interface MyShift {
  _id: string
  date: string
  startTime: string
  endTime: string
  hours?: number
  status: MyShiftStatus
}

interface SubRequest {
  _id: string
  scheduleId: {
    _id: string
    date: string
    startTime: string
    endTime: string
  }
  requester: string // ID
  requesterName: string
  reason: string
  status: string
  createdAt: string
}

// 시간 계산
const calcHours = (startTime: string, endTime: string): number => {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)

  const start = sh * 60 + sm
  let end = eh * 60 + em
  if (end <= start) end += 24 * 60

  return (end - start) / 60
}

// 날짜 파싱 (YYYY-MM-DD -> Local Date)
const parseDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const Schedule = () => {
  const { toast } = useToast()
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [substituteReason, setSubstituteReason] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedShift, setSelectedShift] = useState<MyShift | null>(null)

  const [mySchedule, setMySchedule] = useState<MyShift[]>([])
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false)
  
  const [subRequests, setSubRequests] = useState<SubRequest[]>([])
  const currentUserId = localStorage.getItem('userId')

  // Edit State
  const [editingRequest, setEditingRequest] = useState<SubRequest | null>(null)
  const [editReason, setEditReason] = useState('')
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Collapsible state
  const [isOpen, setIsOpen] = useState(false)
  
  // Pagination state for the collapsible list
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5

  // 나의 스케줄 불러오기
  const fetchMySchedule = async () => {
    try {
      setIsLoadingSchedule(true)
      const res = await api.get<MyShift[]>('/schedule/my')

      // Sort by date ascending
      const sorted = res.data.map((item) => ({
        ...item,
        hours: item.hours ?? calcHours(item.startTime, item.endTime),
      })).sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime())

      setMySchedule(sorted)
    } catch {
      toast({
        title: '오류',
        description: '근무 스케줄 불러오기 실패',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingSchedule(false)
    }
  }

  const fetchSubRequests = async () => {
    try {
      const res = await api.get<SubRequest[]>('/sub/list')
      setSubRequests(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchMySchedule()
    fetchSubRequests()
  }, [])

  // 대타 요청 API
  const handleRequestSubstitute = async () => {
    if (!selectedShift) return
    if (!substituteReason.trim()) {
      toast({ title: '사유를 입력하세요', variant: 'destructive' })
      return
    }

    try {
      const user = JSON.parse(localStorage.getItem('user') ?? '{}')

      await api.post(`/sub/${selectedShift._id}/request`, {
        requesterId: user._id,
        reason: substituteReason,
      })

      toast({
        title: '대타 요청 완료!',
        description: '대타 요청이 완료되었습니다.',
      })

      setSubstituteReason('')
      setSelectedShift(null)
      setIsDialogOpen(false)
      fetchSubRequests() // Refresh list
    } catch (err) {
      console.error(err)
      toast({
        title: '요청 실패',
        description: '대타 요청 중 오류 발생',
        variant: 'destructive',
      })
    }
  }

  const handleEditRequest = (req: SubRequest) => {
      setEditingRequest(req)
      setEditReason(req.reason)
      setIsEditOpen(true)
  }

  const handleUpdateRequest = async () => {
      if (!editingRequest) return
      if (!editReason.trim()) {
          toast({ title: '사유를 입력하세요', variant: 'destructive' })
          return
      }

      try {
          await api.put(`/sub/${editingRequest._id}`, { reason: editReason })
          toast({ title: '수정 완료', description: '대타 요청이 수정되었습니다.' })
          setIsEditOpen(false)
          setEditingRequest(null)
          fetchSubRequests()
      } catch (error) {
          toast({ title: '수정 실패', description: '오류가 발생했습니다.', variant: 'destructive' })
      }
  }

  const handleCancelRequest = async (id: string) => {
      if (!confirm('정말 대타 요청을 취소하시겠습니까?')) return

      try {
          await api.delete(`/sub/${id}`)
          toast({ title: '취소 완료', description: '대타 요청이 취소되었습니다.' })
          fetchSubRequests()
      } catch (error) {
          toast({ title: '취소 실패', description: '오류가 발생했습니다.', variant: 'destructive' })
      }
  }

  // 이번 주 근무 시간 계산 (일요일 ~ 토요일 기준)
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay()) // 이번 주 일요일
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6) // 이번 주 토요일
  endOfWeek.setHours(23, 59, 59, 999)

  const weeklyHours = mySchedule
    .filter((s) => {
      const sDate = parseDate(s.date)
      return sDate >= startOfWeek && sDate <= endOfWeek
    })
    .reduce((acc, d) => acc + (d.hours ?? 0), 0)

  // 다가오는 근무 (오늘 이후)
  const upcomingShifts = mySchedule.filter((d) => {
    const sDate = parseDate(d.date)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return sDate >= todayStart
  }).length

  const workedDays = mySchedule.map(s => parseDate(s.date));
  const subRequestDays = subRequests
    .filter(s => s.scheduleId && s.scheduleId.date)
    .map(s => parseDate(s.scheduleId.date));

  // Filter Logic
  const isDateSelected = date !== undefined;
  
  const filteredSchedule = isDateSelected 
    ? mySchedule.filter(s => {
        const sDate = parseDate(s.date);
        return sDate.toDateString() === date.toDateString();
      })
    : mySchedule;

  const selectedDateSubRequests = isDateSelected
    ? subRequests.filter(s => {
        if (!s.scheduleId || !s.scheduleId.date) return false;
        const sDate = parseDate(s.scheduleId.date);
        return sDate.toDateString() === date.toDateString();
    })
    : [];

  // For default view (no date selected)
  const top3 = filteredSchedule.slice(0, 3);
  const rest = filteredSchedule.slice(3);

  // Pagination logic for 'rest'
  const totalPages = Math.ceil(rest.length / itemsPerPage);
  const paginatedRest = rest.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  }

  return (
    <div className="space-y-6">
      {/* 대타 요청 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>대타 요청</DialogTitle>
            <DialogDescription>
              선택한 근무에 대한 대타 사유를 입력하세요
            </DialogDescription>
          </DialogHeader>

          {selectedShift && (
            <div className="space-y-3">
              <p className="text-sm">
                📅 {new Date(selectedShift.date).toLocaleDateString()} •{' '}
                {selectedShift.startTime} - {selectedShift.endTime}
              </p>

              <Textarea
                placeholder="사유 입력"
                value={substituteReason}
                onChange={(e) => setSubstituteReason(e.target.value)}
              />

              <Button className="w-full" onClick={handleRequestSubstitute}>
                요청 보내기
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 상단 요약 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex gap-2">
              <Clock className="w-4 h-4" /> 이번 주 근무
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{weeklyHours}시간</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex gap-2">
              <CalendarIcon className="w-4 h-4" /> 다가오는 근무
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{upcomingShifts}일</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">대타 가능</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{subRequests.filter(r => r.status === 'requested' || r.status === 'approved_by_owner').length}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 메인 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 내 스케줄 */}
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>나의 근무 스케줄</CardTitle>
            {isDateSelected && (
                <Button variant="ghost" size="sm" onClick={() => setDate(undefined)}>
                    <RefreshCcw className="w-4 h-4 mr-2"/> 전체 보기
                </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingSchedule && (
              <p className="py-6 text-center">불러오는 중...</p>
            )}

            {/* Selected Date Sub Requests */}
            {isDateSelected && selectedDateSubRequests.length > 0 && (
                <div className="mb-6 space-y-3">
                    <h3 className="text-sm font-medium text-primary flex items-center gap-2">
                        <RefreshCcw className="w-4 h-4" /> 대타 요청 목록
                    </h3>
                    {selectedDateSubRequests.map(req => (
                        <div key={req._id} className="p-3 border border-primary/20 bg-primary/5 rounded-lg">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="font-medium text-sm">{req.requesterName}님의 대타 요청</p>
                                    <p className="text-xs text-muted-foreground">
                                        {req.scheduleId?.startTime} - {req.scheduleId?.endTime}
                                    </p>
                                </div>
                                <span className="text-xs bg-background px-2 py-1 rounded border">
                                    {req.status === 'requested' ? '요청중' : 
                                     req.status === 'approved_by_owner' ? '모집중' : 
                                     req.status === 'accepted_by_sub' ? '수락됨' : '완료'}
                                </span>
                            </div>
                            <div className="text-sm bg-background/50 p-2 rounded mb-2">
                                <span className="font-medium text-xs text-muted-foreground block mb-1">사유:</span>
                                {req.reason}
                            </div>
                            
                            {req.requester === currentUserId && req.status === 'requested' && (
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleEditRequest(req)}>
                                        수정
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancelRequest(req._id)}>
                                        취소
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                    <div className="h-px bg-border my-4" />
                </div>
            )}

            {/* Top 3 (or all if filtered by date) */}
            {top3.length === 0 && !isLoadingSchedule && selectedDateSubRequests.length === 0 && (
                <p className="text-center text-muted-foreground py-4">스케줄이 없습니다.</p>
            )}

            {top3.map((day) => (
              <div key={day._id} className="p-3 border rounded-lg mb-2 bg-card text-card-foreground shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {parseDate(day.date).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {day.startTime} - {day.endTime}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedShift(day)
                      setIsDialogOpen(true)
                    }}
                  >
                    대타 요청
                  </Button>
                </div>
              </div>
            ))}

            {/* Collapsible Rest */}
            {!isDateSelected && rest.length > 0 && (
                <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full flex justify-between">
                            <span>{isOpen ? '접기' : `더 보기 (${rest.length}개)`}</span>
                            {isOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-2">
                        {paginatedRest.map((day) => (
                            <div key={day._id} className="p-3 border rounded-lg bg-muted/50">
                                <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-sm">
                                    {parseDate(day.date).toLocaleDateString()}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                    {day.startTime} - {day.endTime}
                                    </p>
                                </div>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                    setSelectedShift(day)
                                    setIsDialogOpen(true)
                                    }}
                                >
                                    대타
                                </Button>
                                </div>
                            </div>
                        ))}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex justify-center mt-4 gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                >
                                    이전
                                </Button>
                                <span className="flex items-center text-sm">
                                    {currentPage} / {totalPages}
                                </span>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    다음
                                </Button>
                            </div>
                        )}
                    </CollapsibleContent>
                </Collapsible>
            )}
          </CardContent>
        </Card>

        {/* 달력 */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>달력 보기</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
              modifiers={{
                  worked: workedDays,
                  subRequest: subRequestDays
              }}
              modifiersClassNames={{
                  worked: "bg-primary/20 font-bold text-primary",
                  subRequest: "after:content-['•'] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:text-red-500 after:text-xs"
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>대타 요청 수정</DialogTitle>
                <DialogDescription>대타 요청 사유를 수정합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
                <Textarea 
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="수정할 사유를 입력하세요"
                />
                <Button className="w-full" onClick={handleUpdateRequest}>
                    수정 완료
                </Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Schedule
