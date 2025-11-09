import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export const formatNumber = (value: number | string | null | undefined, locale = 'en-US') => {
  const safeValue = Number(value ?? 0);
  return new Intl.NumberFormat(locale).format(Number.isNaN(safeValue) ? 0 : safeValue);
};

export const formatCurrency = (
  value: number | string | null | undefined,
  currency = 'USD',
  locale = 'en-US'
) => {
  const safeValue = Number(value ?? 0);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number.isNaN(safeValue) ? 0 : safeValue
  );
};

export const formatDateTime = (
  value: string | number | Date | null | undefined,
  locale = 'en-US',
  timeZone = 'UTC',
  options?: Intl.DateTimeFormatOptions
) => {
  const timestamp = value ? dayjs(value) : dayjs();
  return timestamp
    .tz(timeZone)
    .locale(locale)
    .format(options?.timeZoneName ? 'YYYY-MM-DD HH:mm:ss z' : 'YYYY-MM-DD HH:mm');
};

export const formatRelative = (
  value: string | number | Date | null | undefined,
  reference: string | number | Date = Date.now()
) => {
  const target = value ? dayjs(value) : dayjs();
  return target.to(dayjs(reference));
};
