import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { TicketList } from './components/TicketList';
import { TicketListControls } from './components/TicketListControls';
import { useFilteredTickets, DEFAULT_CONTROLS, type ListControls } from './components/useFilteredTickets';
import { QueueTabs } from './components/QueueTabs';
import { bucketCounts, inBucket, type QueueSelection } from './components/queueBuckets';

/**
 * Department Queue — inbound tickets for the current (destination) department.
 * Drafts are excluded (they never appear in a destination queue — P13 §7).
 *
 * This is a destination's primary operational workspace, so it carries find/filter/sort
 * (D03 §2: "Very High density → Table + Filters"; defect UI-003). Sorting defaults to priority,
 * which is what the subtitle promises and what the store actually does.
 */
export function DepartmentQueuePage() {
  const { user } = useAuth();
  const tickets = useTicketStore((s) => s.tickets);
  const queue = useTicketStore((s) => s.departmentQueue)(user!.departmentCode);
  void tickets;

  // D04 #9: the dashboard KPIs advertised a drill-down but landed on the UNFILTERED list — the
  // user had to re-find the very tickets the number counted. They now pass ?status=.
  const [params] = useSearchParams();
  const [controls, setControls] = useState(() => {
    const status = params.get('status') as ListControls['status'] | null;
    return status ? { ...DEFAULT_CONTROLS, status } : DEFAULT_CONTROLS;
  });
  /**
   * Queue buckets (B04 §Queue Engine) sit ABOVE the find/filter/sort controls, not inside them:
   * the bucket answers "which stage of the work am I looking at", which is the question a
   * destination asks first. Counts are computed over the whole queue so an empty bucket still
   * shows a zero — "nothing is waiting on a requester" is information, not an absence.
   */
  const [bucket, setBucket] = useState<QueueSelection>('all');
  const counts = bucketCounts(queue);
  const rows = useFilteredTickets(inBucket(queue, bucket), controls);

  return (
    <section aria-labelledby="q-title">
      <PageHeader
        icon={Inbox}
        titleId="q-title"
        title="Department Queue"
        description="Requests routed to your department, sorted by priority."
      />

      {queue.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No inbound tickets right now. New submissions will appear here automatically."
        />
      ) : (
        <>
          <QueueTabs value={bucket} onChange={setBucket} counts={counts} />
          <TicketListControls value={controls} onChange={setControls} total={counts[bucket]} showing={rows.length} />
          <TicketList tickets={rows} direction="to" emptyLabel="No tickets match those filters." from="/app/queue" />
        </>
      )}
    </section>
  );
}
