import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Ticket as TicketIcon, PlusCircle } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { TicketList } from './components/TicketList';
import { TicketListControls } from './components/TicketListControls';
import { useFilteredTickets, DEFAULT_CONTROLS, type ListControls } from './components/useFilteredTickets';

/** My Tickets — everything the current user raised (P13). Drafts included (isolated from queues). */
export function MyTicketsPage() {
  const { user } = useAuth();
  const tickets = useTicketStore((s) => s.tickets);
  const mine = useTicketStore((s) => s.myTickets)(user!.id);
  void tickets; // subscribe to store changes

  // D04 #9: the dashboard KPIs advertised a drill-down but landed on the UNFILTERED list — the
  // user had to re-find the very tickets the number counted. They now pass ?status=.
  const [params] = useSearchParams();
  const [controls, setControls] = useState(() => {
    const status = params.get('status') as ListControls['status'] | null;
    return status ? { ...DEFAULT_CONTROLS, status } : DEFAULT_CONTROLS;
  });
  const rows = useFilteredTickets(mine, controls);

  return (
    <section aria-labelledby="mt-title">
      <PageHeader
        icon={TicketIcon}
        titleId="mt-title"
        title="My Tickets"
        description="Requests you have raised."
        action={
          <Link
            to="/app/tickets/new"
            className="btn-primary"
          >
            <PlusCircle size={16} aria-hidden /> New ticket
          </Link>
        }
      />

      {mine.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          description="Raise your first request and it will appear here with its live status and SLA."
          action={
            <Link
              to="/app/tickets/new"
              className="btn-primary mt-2"
            >
              <PlusCircle size={16} aria-hidden /> Create ticket
            </Link>
          }
        />
      ) : (
        <>
          <TicketListControls value={controls} onChange={setControls} total={mine.length} showing={rows.length} />
          <TicketList tickets={rows} direction="from" emptyLabel="No tickets match those filters." from="/app/tickets" />
        </>
      )}
    </section>
  );
}
