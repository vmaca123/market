
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

try {
    const todayStr = dayjs().tz('Asia/Seoul').format('YYYY-MM-DD')
    console.log('Date:', todayStr)
    const nowTime = dayjs().tz('Asia/Seoul').format('HH:mm')
    console.log('Time:', nowTime)
} catch (e) {
    console.error(e)
}
