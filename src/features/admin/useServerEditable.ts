import { useEffect, useState } from 'react';
import { ConfigApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';

/**
 * Is this configuration surface actually WRITABLE where the application is currently reading it?
 *
 * This exists because of the worst defect the B06 audit found. `SlaManagementPage` and
 * `SystemConfigPage` never imported `USE_API` at all: in API mode they wrote to localStorage,
 * showed "Saved · versioned · audited", and the server was never touched. The administrator got a
 * green confirmation, a version row and an audit entry for a change that governed nothing —
 * every ticket kept computing against the server's compile-time policy.
 *
 * That is worse than an error. An error is a thing you act on; a false success is a thing you
 * stop checking.
 *
 * The server already says so itself: `GET /config/sla` returns `editable: false` alongside the
 * policy, and the writes return 501 because there is no Config table yet. That flag had zero
 * callers. Reading it means the day a Config table lands, the flag flips server-side and these
 * screens become editable with no client change.
 *
 * `pending` matters: until the answer arrives the controls must not claim to be either. Rendering
 * them enabled and then disabling them a moment later invites exactly the click this prevents.
 */
export interface ServerEditable {
  /** May the administrator save? True in prototype mode, server-decided in API mode. */
  readonly editable: boolean;
  readonly pending: boolean;
  /** Why not, in words an administrator can act on. Null when editable. */
  readonly reason: string | null;
}

const NOT_YET =
  'The server holds this policy as a compile-time constant and has no configuration store yet, so it cannot accept a change. Saving is disabled rather than writing to this browser and reporting success.';

export function useServerEditable(): ServerEditable {
  // Prototype mode persists to localStorage and genuinely governs the running app, so it is
  // editable and says so without a round trip.
  const [state, setState] = useState<ServerEditable>(
    USE_API ? { editable: false, pending: true, reason: null } : { editable: true, pending: false, reason: null },
  );

  useEffect(() => {
    if (!USE_API) return;
    let live = true;
    void ConfigApi.sla().then((r) => {
      if (!live) return;
      if (!r.ok) {
        // Could not ask. Refuse the write rather than guess — guessing "editable" is precisely
        // the failure being fixed.
        setState({ editable: false, pending: false, reason: `Could not check whether this is editable: ${r.error}` });
        return;
      }
      setState({
        editable: r.value.editable,
        pending: false,
        reason: r.value.editable ? null : NOT_YET,
      });
    });
    return () => {
      live = false;
    };
  }, []);

  return state;
}
