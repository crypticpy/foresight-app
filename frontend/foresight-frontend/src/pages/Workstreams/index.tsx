/**
 * Workstreams list composer: loads the user's workstreams, polls scan
 * statuses while any are active, owns the modal-open state for
 * form/delete/share/members, and partitions workstreams into the Strategic /
 * My / Shared sections.
 *
 * @module pages/Workstreams
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, FolderOpen, HelpCircle, Plus } from "lucide-react";
import { MembersDrawer } from "../../components/collaboration/MembersDrawer";
import { ShareWorkstreamModal } from "../../components/collaboration/ShareWorkstreamModal";
import type { Workstream } from "../../components/WorkstreamForm";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useCapabilities } from "../../hooks/useCapabilities";
import { getAuthToken } from "../../lib/auth";
import type { Driver } from "../../lib/frameworks-api";
import type { WorkstreamScanStatusResponse } from "../../lib/workstream-api";
import {
  deleteWorkstream,
  fetchScanStatuses,
  loadDriverMap,
  loadWorkstreamList,
} from "./api";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { FormModal } from "./FormModal";
import { BANNER_DISMISSED_KEY, HelpBanner } from "./HelpBanner";
import {
  isMyWorkstream,
  isOrgOwnedWorkstream,
  isSharedWorkstream,
} from "./ownership";
import { WorkstreamSection } from "./WorkstreamSection";

const SCAN_POLL_INTERVAL_MS = 5000;

export default function Workstreams() {
  const { user } = useAuthContext();
  const { canCreateWorkstream, forWorkstream } = useCapabilities();
  const navigate = useNavigate();

  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingWorkstream, setEditingWorkstream] = useState<
    Workstream | undefined
  >(undefined);
  const [deletingWorkstream, setDeletingWorkstream] = useState<
    Workstream | undefined
  >(undefined);
  const [sharingWorkstream, setSharingWorkstream] = useState<
    Workstream | undefined
  >(undefined);
  const [membersWorkstream, setMembersWorkstream] = useState<
    Workstream | undefined
  >(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  const [scanStatuses, setScanStatuses] = useState<
    Record<string, WorkstreamScanStatusResponse>
  >({});
  const [driversById, setDriversById] = useState<Record<string, Driver>>({});

  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workstreamsRef = useRef<Workstream[]>([]);

  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, "true");
    } catch {
      // localStorage may be unavailable.
    }
  };

  const handleRestoreBanner = () => {
    setBannerDismissed(false);
    try {
      localStorage.removeItem(BANNER_DISMISSED_KEY);
    } catch {
      // localStorage may be unavailable.
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const map = await loadDriverMap(token);
        if (!cancelled) setDriversById(map);
      } catch {
        // Silently ignore — driver chips simply won't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshScanStatuses = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;

    const { statuses, hasActiveScans } = await fetchScanStatuses(
      token,
      workstreamsRef.current,
    );
    setScanStatuses(statuses);

    if (hasActiveScans) {
      if (!scanPollRef.current) {
        scanPollRef.current = setInterval(() => {
          refreshScanStatuses();
        }, SCAN_POLL_INTERVAL_MS);
      }
    } else if (scanPollRef.current) {
      clearInterval(scanPollRef.current);
      scanPollRef.current = null;
    }
  }, []);

  const loadWorkstreams = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        setWorkstreams([]);
        workstreamsRef.current = [];
        return;
      }
      const list = await loadWorkstreamList(token);
      setWorkstreams(list);
      workstreamsRef.current = list;
      if (list.length > 0) {
        refreshScanStatuses();
      }
    } catch (error) {
      console.error("Error loading workstreams:", error);
      setErrorMessage(
        error instanceof Error
          ? `Could not load workstreams: ${error.message}`
          : "Could not load workstreams. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [refreshScanStatuses]);

  useEffect(() => {
    loadWorkstreams();
  }, [loadWorkstreams]);

  useEffect(() => {
    return () => {
      if (scanPollRef.current) {
        clearInterval(scanPollRef.current);
      }
    };
  }, []);

  const handleFormSuccess = (createdId?: string, scanTriggered?: boolean) => {
    setShowForm(false);
    setEditingWorkstream(undefined);
    if (createdId && scanTriggered) {
      navigate(`/workstreams/${createdId}/board`, {
        state: { scanJustStarted: true },
      });
    } else {
      loadWorkstreams();
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingWorkstream(undefined);
  };

  const handleEditClick = (workstream: Workstream) => {
    setEditingWorkstream(workstream);
    setShowForm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingWorkstream || !user) return;
    setIsDeleting(true);
    try {
      await deleteWorkstream(deletingWorkstream.id, user.id);
      setDeletingWorkstream(undefined);
      loadWorkstreams();
    } catch (error) {
      console.error("Error deleting workstream:", error);
      setErrorMessage("Failed to delete workstream. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand-blue"></div>
      </div>
    );
  }

  const orgWorkstreams = workstreams.filter(isOrgOwnedWorkstream);
  const myWorkstreams = workstreams.filter(isMyWorkstream);
  const sharedWorkstreams = workstreams.filter(isSharedWorkstream);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
              Workstreams
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Create custom research streams based on your strategic priorities.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {bannerDismissed && (
              <button
                onClick={handleRestoreBanner}
                className="p-2 text-gray-400 hover:text-brand-blue hover:bg-brand-light-blue/30 dark:hover:bg-brand-blue/20 rounded-lg transition-colors"
                aria-label="Show workstream help"
                title="Show workstream help"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            )}
            <Link
              to="/guide/workstreams"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-brand-blue dark:hover:text-brand-light-blue hover:bg-brand-light-blue/30 dark:hover:bg-brand-blue/20 rounded-lg transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              How to use
            </Link>
          </div>
        </div>
        {canCreateWorkstream && (
          <button
            onClick={() => {
              setEditingWorkstream(undefined);
              setShowForm(true);
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Workstream
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            &#x2715;
          </button>
        </div>
      )}

      {!bannerDismissed && <HelpBanner onDismiss={handleDismissBanner} />}

      {workstreams.length === 0 ? (
        <EmptyState
          canCreate={canCreateWorkstream}
          onCreate={() => {
            setEditingWorkstream(undefined);
            setShowForm(true);
          }}
        />
      ) : (
        <div className="space-y-10">
          {orgWorkstreams.length > 0 && (
            <WorkstreamSection
              title="Strategic workstreams"
              subtitle="Organization-wide workstreams aligned to the City's strategic framework. Available to everyone; only admins can edit them."
              workstreams={orgWorkstreams}
              scanStatuses={scanStatuses}
              driversById={driversById}
              onEdit={handleEditClick}
              onDelete={setDeletingWorkstream}
              onShare={setSharingWorkstream}
              onMembers={setMembersWorkstream}
            />
          )}

          <WorkstreamSection
            title="My workstreams"
            subtitle="Research streams you've created."
            workstreams={myWorkstreams}
            scanStatuses={scanStatuses}
            driversById={driversById}
            onEdit={handleEditClick}
            onDelete={setDeletingWorkstream}
            onShare={setSharingWorkstream}
            onMembers={setMembersWorkstream}
            emptyState={
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                You haven&apos;t created any workstreams yet. Click{" "}
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  New Workstream
                </span>{" "}
                to start one.
              </div>
            }
          />

          {sharedWorkstreams.length > 0 && (
            <WorkstreamSection
              title="Shared with me"
              subtitle="Workstreams where you have collaborator access."
              workstreams={sharedWorkstreams}
              scanStatuses={scanStatuses}
              driversById={driversById}
              onEdit={handleEditClick}
              onDelete={setDeletingWorkstream}
              onShare={setSharingWorkstream}
              onMembers={setMembersWorkstream}
            />
          )}
        </div>
      )}

      {showForm && (
        <FormModal
          workstream={editingWorkstream}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      )}

      {deletingWorkstream && (
        <DeleteConfirmModal
          workstream={deletingWorkstream}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingWorkstream(undefined)}
          isDeleting={isDeleting}
        />
      )}

      {sharingWorkstream && (
        <ShareWorkstreamModal
          workstreamId={sharingWorkstream.id}
          open={Boolean(sharingWorkstream)}
          onClose={() => setSharingWorkstream(undefined)}
          onChanged={loadWorkstreams}
        />
      )}

      {membersWorkstream && (
        <MembersDrawer
          workstreamId={membersWorkstream.id}
          open={Boolean(membersWorkstream)}
          canManage={forWorkstream(membersWorkstream).canManage}
          onClose={() => setMembersWorkstream(undefined)}
        />
      )}
    </div>
  );
}

interface EmptyStateProps {
  canCreate: boolean;
  onCreate: () => void;
}

function EmptyState({ canCreate, onCreate }: EmptyStateProps) {
  return (
    <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
      <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
        No workstreams yet
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Create your first workstream to start tracking relevant intelligence.
      </p>
      {canCreate && (
        <div className="mt-6">
          <button
            onClick={onCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Workstream
          </button>
        </div>
      )}
    </div>
  );
}
