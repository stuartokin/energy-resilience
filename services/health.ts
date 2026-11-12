// Records whether each live data source actually answered, so the status panel
// reports what really happened rather than assuming everything is working.
type Health = { ok: boolean, at: number, detail?: string };
const health = new Map<string, Health>();

export const markOk = (source: string, detail?: string) => health.set(source, { ok: true, at: Date.now(), detail });
export const markFail = (source: string, detail?: string) => health.set(source, { ok: false, at: Date.now(), detail });

// 'Operational' | 'Unavailable' | 'Not checked yet'
export const statusOf = (source: string): { status: string, detail: string } => {
    const h = health.get(source);
    if (!h) return { status: 'Not checked yet', detail: '' };
    const when = new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return h.ok
        ? { status: 'Operational', detail: `${h.detail ? h.detail + ' · ' : ''}checked ${when}` }
        : { status: 'Unavailable', detail: `${h.detail || 'failed'} · ${when}` };
};
