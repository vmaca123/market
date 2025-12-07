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
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
} from 'lucide-react'
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
  requester: string
  requesterName: string
  reason: string
  status: string
  createdAt: string
}

const calcHours = (startTime: string, endTime: string): number => {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)

  const start = sh * 60 + sm
  let end = eh * 60 + em
  if (end <= start) end += 24 * 60

  return (end - start) / 60
}

const parseDate = (dateStr: string) => {
  if (!dateStr) return new Date()
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
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
  const currentUser = JSON.parse(localStorage.getItem('user') ?? '{}')
  const currentUserId = currentUser._id

  const [editingRequest, setEditingRequest] = useState<SubRequest | null>(null)
  const [editReason, setEditReason] = useState('')
  const [isEditOpen, setIsEditOpen] = useState(false)

  const [isOpen, setIsOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5

  const fetchMySchedule = async () => {
    try {
      setIsLoadingSchedule(true)
      const res = await api.get<MyShift[]>('/schedule/my')

      const sorted = res.data
        .map((item) => ({
          ...item,
          hours: item.hours ?? calcHours(item.startTime, item.endTime),
        }))
        .sort(
          (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
        )

      setMySchedule(sorted)
    } catch {
      toast({
        title: '오류',
        description: '스케줄 불러오기 실패',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingSchedule(false)
    }
  }

  const fetchSubRequests = async () => {
    try {
      const res = await api.get<SubRequest[]>('/sub/list')
      setSubRequests(res.data.filter((r) => r.status !== 'approved_final')) // ⭐ 추가된 부분
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchMySchedule()
    fetchSubRequests()
  }, [])

  const handleRequestSubstitute = async () => {
    if (!selectedShift) return
    if (!substituteReason.trim()) {
      toast({ title: '사유를 입력하세요', variant: 'destructive' })
      return
    }

    try {
      await api.post(`/sub/${selectedShift._id}/request`, {
        requesterId: currentUserId,
        reason: substituteReason,
      })

      toast({
        title: '대타 요청 완료!',
        description: '대타 요청이 등록되었습니다.',
      })

      setSubstituteReason('')
      setSelectedShift(null)
      setIsDialogOpen(false)
      fetchSubRequests()
    } catch (err) {
      console.error(err)
      toast({
        title: '요청 실패',
        description: '다시 시도해주세요.',
        variant: 'destructive',
      })
    }
  }

  const handleUpdateRequest = async () => {
    if (!editingRequest || !editReason.trim()) return
    try {
      await api.put(`/sub/${editingRequest._id}`, { reason: editReason })
      toast({ title: '수정 완료' })
      setIsEditOpen(false)
      setEditingRequest(null)
      fetchSubRequests()
    } catch {
      toast({ title: '수정 실패', variant: 'destructive' })
    }
  }

  const handleCancelRequest = async (id: string) => {
    if (!confirm('취소할까요?')) return
    try {
      await api.delete(`/sub/${id}`)
      toast({ title: '취소 완료' })
      fetchSubRequests()
    } catch {
      toast({ title: '취소 실패', variant: 'destructive' })
    }
  }

  const handleAcceptSubRequest = async (id: string) => {
    try {
      const token = localStorage.getItem('token')

      await api.patch(
        `/sub/accept/${id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      toast({ title: '대타 수락 완료!', description: '최종 승인 대기 중...' })
      fetchSubRequests()
    } catch {
      toast({ title: '수락 실패', variant: 'destructive' })
    }
  }

  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  endOfWeek.setHours(23, 59, 59)

  const weeklyHours = mySchedule
    .filter((s) => {
      const sDate = parseDate(s.date)
      return sDate >= startOfWeek && sDate <= endOfWeek
    })
    .reduce((acc, d) => acc + (d.hours ?? 0), 0)

  const upcomingShifts = mySchedule.filter((d) => {
    const sDate = parseDate(d.date)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return sDate >= todayStart
  }).length

  const workedDays = mySchedule.map((s) => parseDate(s.date))
  const subRequestDays = subRequests.map((s) => parseDate(s.scheduleId.date))

  const isDateSelected = date !== undefined

  const filteredSchedule = isDateSelected
    ? mySchedule.filter(
        (s) => parseDate(s.date).toDateString() === date?.toDateString()
      )
    : mySchedule

  const selectedDateSubRequests = isDateSelected
    ? subRequests.filter(
        (s) =>
          parseDate(s.scheduleId.date).toDateString() === date?.toDateString()
      )
    : []

  const top3 = filteredSchedule.slice(0, 3)
  const rest = filteredSchedule.slice(3)

  const totalPages = Math.ceil(rest.length / itemsPerPage)
  const paginatedRest = rest.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  return (
    <div className="space-y-6">
      {/* 대타 요청 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>대타 요청</DialogTitle>
          </DialogHeader>

          {selectedShift && (
            <div className="space-y-3">
              <p className="text-sm">
                📅 {selectedShift.date} • {selectedShift.startTime} -{' '}
                {selectedShift.endTime}
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
              <Clock className="w-4" /> 이번 주 근무
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{weeklyHours}시간</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex gap-2">
              <CalendarIcon className="w-4" /> 다가오는 근무
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
            <p className="text-2xl font-bold text-primary">
              {
                subRequests.filter(
                  (r) =>
                    r.status === 'requested' || r.status === 'approved_by_owner'
                ).length
              }
              건
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 메인 UI */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 내 스케줄 */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <CardTitle>나의 근무 스케줄</CardTitle>
            {isDateSelected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDate(undefined)}
              >
                전체 보기
              </Button>
            )}
          </CardHeader>

          <CardContent>
            {isDateSelected && selectedDateSubRequests.length > 0 && (
              <div className="space-y-3 mb-4">
                <h3 className="text-sm font-medium text-primary">
                  해당 날짜 대타 요청
                </h3>

                {selectedDateSubRequests.map((req) => (
                  <div
                    key={req._id}
                    className="p-3 border rounded-lg bg-muted/20"
                  >
                    <div className="flex justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {req.requesterName}님의 대타 요청
                        </p>
                        <p className="text-xs">
                          {req.scheduleId.startTime} - {req.scheduleId.endTime}
                        </p>
                      </div>

                      <span className="text-xs border px-2 py-1 rounded">
                        {req.status === 'requested'
                          ? '요청중'
                          : req.status === 'approved_by_owner'
                          ? '모집중'
                          : req.status === 'accepted_by_sub'
                          ? '수락완료'
                          : '취소됨'}
                      </span>
                    </div>

                    <div className="text-sm bg-background/50 p-2 rounded mt-2">
                      <strong className="text-xs text-muted-foreground">
                        사유:{' '}
                      </strong>
                      {req.reason}
                    </div>

                    {req.requester === currentUserId &&
                      req.status === 'requested' && (
                        <div className="flex justify-end gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingRequest(req)
                              setEditReason(req.reason)
                              setIsEditOpen(true)
                            }}
                          >
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => handleCancelRequest(req._id)}
                          >
                            취소
                          </Button>
                        </div>
                      )}

                    {req.requester !== currentUserId &&
                      req.status === 'approved_by_owner' && (
                        <div className="flex justify-end mt-2">
                          <Button
                            size="sm"
                            className="bg-primary text-white"
                            onClick={() => handleAcceptSubRequest(req._id)}
                          >
                            대타 수락
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}

            {top3.length === 0 && (
              <p className="text-center py-6 text-muted-foreground">
                스케줄 없음
              </p>
            )}

            {top3.map((day) => (
              <div key={day._id} className="p-3 border rounded-lg mb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{day.date}</p>
                    <p className="text-xs text-muted-foreground">
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

            {!isDateSelected && rest.length > 0 && (
              <Collapsible
                open={isOpen}
                onOpenChange={setIsOpen}
                className="mt-3"
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full">
                    {isOpen ? '접기' : `더보기 (${rest.length}개)`}
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-2">
                  {paginatedRest.map((day) => (
                    <div
                      key={day._id}
                      className="p-3 border rounded-lg bg-muted/30"
                    >
                      <div className="flex justify-between items-center text-sm">
                        <span>
                          {day.date} • {day.startTime}-{day.endTime}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
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

                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        이전
                      </Button>
                      <span className="text-sm">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
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
        <Card>
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
                subRequest: subRequestDays,
              }}
              modifiersClassNames={{
                worked: 'bg-primary/20 font-bold text-primary',
                subRequest:
                  "after:content-['•'] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:text-red-500 after:text-xs",
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>대타 요청 수정</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
          />
          <Button className="w-full" onClick={handleUpdateRequest}>
            수정 완료
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Schedule
