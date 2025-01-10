export function parseToCron(isoString: string) {
    const date = new Date(isoString);
    const minute = date.getUTCMinutes();
    const hour = date.getUTCHours();
    const dayOfMonth = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    return `${minute} ${hour} ${dayOfMonth} ${month} *`;
}
