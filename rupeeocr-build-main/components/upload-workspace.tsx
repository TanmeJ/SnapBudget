'use client';

import { Button, CategoryBadge } from '@/components/ui';
import { formatDate, formatFileSize, formatINR } from '@/lib/utils';

export interface UploadWorkspaceFile {
  id: string;
  file: File;
  preview?: string;
  status: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
  result?: any;
}

const FLOW_STEPS = [
  { number: '1', label: 'Upload', helper: 'Add receipt source' },
  { number: '2', label: 'Processing', helper: 'Extracting fields' },
  { number: '3', label: 'Review', helper: 'Confirm & save' },
];

export function UploadStepper({
  currentStep,
}: {
  currentStep: 1 | 2 | 3;
}) {
  return (
    <div className="mt-2 rounded-3xl bg-surface-container-low p-3 md:p-4">
      <div className="grid gap-3 md:grid-cols-3">
      {FLOW_STEPS.map((step, index) => {
        const stepNumber = (index + 1) as 1 | 2 | 3;
        const active = stepNumber <= currentStep;
        const current = stepNumber === currentStep;

        return (
          <div key={step.label} className="relative px-2 text-center">
            <div className="absolute left-0 right-0 top-4 -z-20 hidden h-px bg-[#dfe3ea] md:block" />
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-on-surface-variant relative z-10 transition-all duration-200 ease-in-out">
              <span className={active ? 'text-white' : 'text-on-surface-variant'}>
                {step.number}
              </span>
              <div className={`absolute inset-0 mx-auto h-8 w-8 rounded-full ${active ? 'bg-primary' : 'bg-surface-container-high'} -z-10`} />
            </div>
            <p className={`mt-2 text-[13px] font-semibold ${current ? 'text-primary' : active ? 'text-on-surface' : 'text-outline'}`}>
              {step.label}
            </p>
            <p className="mt-1 text-[11px] text-on-surface-variant">{step.helper}</p>
          </div>
        );
      })}
      </div>
    </div>
  );
}

export function UploadCard({
  isDragging,
  state,
  onDrop,
  onDragOver,
  onDragLeave,
  onOpenPicker,
  onSelectFiles,
  onUseCamera,
  onStartScan,
  onConfirmSave,
  fileInput,
  cameraInput,
}: {
  isDragging: boolean;
  state: 'idle' | 'uploading' | 'processing' | 'review';
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onOpenPicker: () => void;
  onSelectFiles: () => void;
  onUseCamera: () => void;
  onStartScan: () => void;
  onConfirmSave: () => void;
  fileInput: React.ReactNode;
  cameraInput: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] p-6 md:p-8 text-center shadow-ambient-lg transition-all duration-300 ease-in-out min-h-[520px] flex flex-col justify-center ${
        isDragging
          ? 'bg-secondary-container'
          : 'bg-surface-container-lowest hover:shadow-[0_18px_52px_rgba(25,28,30,0.09)]'
      }`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={state !== 'processing' ? onOpenPicker : undefined}
      onKeyDown={(event) => {
        if (state === 'processing') return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenPicker();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload receipt files"
    >
      {fileInput}
      {cameraInput}

      <div className="absolute right-[-5rem] top-[-5rem] h-56 w-56 rounded-full bg-secondary-fixed opacity-30 blur-3xl" />
      <div className="absolute bottom-[-4rem] left-[-4rem] h-48 w-48 rounded-full bg-primary-fixed opacity-40 blur-3xl" />

      <div className="relative mx-auto mb-7 flex w-full max-w-[430px] flex-1 items-center justify-center overflow-hidden rounded-[1.5rem] bg-surface-container-low">
        {state === 'review' ? (
          <div className="relative h-full min-h-[260px] w-full">
            <div className="absolute inset-5 rounded-2xl bg-white shadow-[0_18px_36px_rgba(25,28,30,0.08)] rotate-[-2deg]" />
            <div className="absolute inset-8 rounded-2xl bg-surface-container-lowest px-6 py-7 text-left shadow-[0_14px_34px_rgba(25,28,30,0.08)]">
              <div className="h-3 w-28 rounded-full bg-primary/20" />
              <div className="mt-6 space-y-3">
                <div className="h-2 w-full rounded-full bg-surface-container-high" />
                <div className="h-2 w-4/5 rounded-full bg-surface-container-high" />
                <div className="h-2 w-3/5 rounded-full bg-surface-container-high" />
              </div>
              <div className="absolute bottom-7 right-6 rounded-xl bg-secondary-container px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Ready</p>
              </div>
            </div>
            <div className="ocr-glass absolute left-10 top-20 rounded-xl px-4 py-3 shadow-ambient">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Fields detected</p>
            </div>
          </div>
        ) : state === 'processing' ? (
          <div className="relative h-full min-h-[260px] w-full">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,21,103,0.16),transparent_68%)]" />
            <div className="ocr-glass absolute inset-0 flex flex-col items-center justify-center px-6">
              <div className="bg-primary-gradient mb-6 flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl shadow-primary-glow">
                <span className="material-symbols-outlined text-3xl text-white">sync</span>
              </div>
              <h3 className="font-headline text-2xl font-extrabold text-primary">Analyzing receipt...</h3>
              <p className="mt-2 text-sm text-secondary">Extracting merchant, amount, date, and category.</p>
              <div className="mt-7 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-container-high">
                <div className="bg-primary-gradient h-full w-2/3 animate-pulse rounded-full" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative h-full min-h-[260px] w-full">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_45%,#001567_0%,transparent_70%)]" />
            <div className="relative z-10 flex h-full min-h-[260px] flex-col items-center justify-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-ambient transition-transform duration-500 hover:scale-105">
                <span className="material-symbols-outlined text-4xl text-primary">cloud_upload</span>
              </div>
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">
                Upload Source
              </span>
            </div>
            <div className="ocr-glass absolute bottom-0 inset-x-0 h-1/2 flex flex-col justify-end p-6 text-left">
              <div className="h-1.5 w-14 rounded-full bg-primary/20" />
              <div className="mt-2 h-1.5 w-28 rounded-full bg-primary/10" />
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 space-y-2">
        <h3 className="font-headline text-[27px] md:text-[32px] font-extrabold leading-[1.05] tracking-[-0.04em] text-primary">
          {state === 'processing'
            ? 'Receipt is being processed'
            : state === 'review'
              ? 'Review extracted data'
              : state === 'uploading'
                ? 'Receipt ready to scan'
                : 'Ready to scan?'}
        </h3>
        <p className="mx-auto max-w-sm text-[14px] font-medium text-secondary">
          {state === 'processing'
            ? 'Hang tight while SnapBudget prepares your structured expense data.'
            : state === 'review'
              ? 'Check the extracted receipt before saving it to your library.'
              : 'Turn paper receipts into clean expense records in seconds.'}
        </p>
        {state === 'idle' && (
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-on-secondary-fixed-variant">
            JPG, PNG, PDF • Max 10MB
          </p>
        )}
      </div>

      {state === 'processing' ? (
        null
      ) : state === 'review' ? (
        <div className="relative z-10 mx-auto mt-5 flex w-full max-w-[560px] flex-col gap-3 rounded-3xl bg-surface-container-low p-4 text-left">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Merchant</p>
              <p className="mt-1 text-sm font-medium text-on-surface">Detected receipt</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Status</p>
              <p className="mt-1 text-sm font-medium text-primary">Ready for review</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Next step</p>
              <p className="mt-1 text-sm font-medium text-on-surface">Confirm & Save</p>
            </div>
          </div>
          <Button onClick={(event) => {
            event.stopPropagation();
            onConfirmSave();
          }} size="sm" className="self-center px-8">
            Confirm & Save
          </Button>
        </div>
      ) : (
        <div className="relative z-10 mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelectFiles();
              }}
              className="bg-primary-gradient min-w-[220px] rounded-xl px-6 py-4 font-headline text-[16px] font-bold text-white shadow-primary-glow transition-all duration-200 ease-in-out hover:shadow-primary-glow-lg focus:outline-none focus:ring-2 focus:ring-primary/25 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined mr-2 align-middle text-[18px]">upload_file</span>
              Upload Receipt
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onUseCamera();
              }}
              className="rounded-lg px-2 py-1 text-[14px] font-semibold text-primary transition-colors hover:text-primary-container focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <span className="material-symbols-outlined mr-1 align-middle text-[18px]">photo_camera</span>
              Use Camera
            </button>
          </div>
        </div>
      )}

      {state === 'uploading' && (
        <div className="relative z-10 mx-auto mt-5 w-full max-w-[420px] rounded-3xl bg-surface-container-low px-5 py-4 text-left">
          <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
            <div className="bg-primary-gradient h-full w-1/3 animate-pulse rounded-full" />
          </div>
          <p className="mt-3 text-sm font-medium text-on-surface">Receipt queued for extraction.</p>
        </div>
      )}

      {state === 'uploading' && (
        <div className="relative z-10 mt-5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartScan();
            }}
            className="bg-primary-gradient min-w-[230px] max-w-full rounded-xl px-7 py-4 text-[15px] font-bold text-white shadow-primary-glow transition-all duration-200 ease-in-out hover:shadow-primary-glow-lg focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined mr-2 align-middle text-[20px]">bolt</span>
            Start Scan
          </button>
        </div>
      )}
    </div>
  );
}

export function BatchSummary({
  totalQueued,
  totalDone,
  filesCount,
  totalAmount,
}: {
  totalQueued: number;
  totalDone: number;
  filesCount: number;
  totalAmount: number;
}) {
  const status = totalQueued > 0 ? 'Ready to scan' : totalDone > 0 ? 'Ready to review' : 'Idle';

  return (
    <aside className="rounded-3xl bg-surface-container-lowest p-5 shadow-ambient">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            Batch
          </p>
          <h4 className="mt-1 font-headline text-lg font-extrabold tracking-[-0.03em] text-on-surface">
            Summary
          </h4>
        </div>
        <span className="rounded-full bg-secondary-container px-3 py-1 text-[11px] font-bold text-primary">
          {status}
        </span>
      </div>

      <div className="mt-6 rounded-[1.35rem] bg-surface-container-low p-4">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px]">currency_rupee</span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]">Detected total</span>
        </div>
        <p className="mt-3 font-headline text-[30px] font-extrabold tracking-[-0.05em] text-primary">
          {formatINR(totalAmount)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-container-low px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Files</p>
          <p className="mt-1 font-headline text-xl font-bold text-on-surface">{filesCount}</p>
        </div>
        <div className="rounded-2xl bg-surface-container-low px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Done</p>
          <p className="mt-1 font-headline text-xl font-bold text-on-surface">{totalDone}</p>
        </div>
      </div>
    </aside>
  );
}

export function UploadedReceiptsList({
  files,
  onRemoveFile,
  onReviewReceipt,
}: {
  files: UploadWorkspaceFile[];
  onRemoveFile: (id: string) => void;
  onReviewReceipt: (id: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="rounded-3xl bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-headline text-lg font-bold text-on-surface">Uploaded Receipts</h4>
        <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
          {files.length} files
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {files.map((file) => {
          const receipt = file.result?.receipt;

          return (
            <div
              key={file.id}
              className="grid gap-3 rounded-[18px] bg-white p-3 md:grid-cols-[72px_1fr_auto]"
            >
              <div className="overflow-hidden rounded-2xl bg-surface-container h-[72px] flex items-center justify-center">
                {file.preview ? (
                  <img src={file.preview} alt={file.file.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-3xl text-on-surface-variant">picture_as_pdf</span>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-on-surface">{receipt?.merchant || file.file.name}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      file.status === 'done'
                        ? 'bg-[#e8f9ef] text-[#0b7a3c]'
                        : file.status === 'error'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {file.status}
                  </span>
                </div>

                <p className="mt-2 text-sm text-on-surface-variant">
                  {file.status === 'done'
                    ? 'Receipt extracted and ready to review.'
                    : file.status === 'error'
                      ? file.error
                      : `${formatFileSize(file.file.size)} • ${file.status === 'processing' ? 'Processing' : 'Queued'}`}
                </p>

                {['uploading', 'processing'].includes(file.status) && (
                  <div className="mt-3 h-2 rounded-full bg-surface-container overflow-hidden">
                    <div className="bg-primary-gradient h-full rounded-full" style={{ width: `${file.progress}%` }} />
                  </div>
                )}

                {receipt && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <div className="rounded-xl bg-surface-container px-3 py-2 text-sm font-semibold text-on-surface">
                      {formatINR(receipt.amount)}
                    </div>
                    <div className="rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface">
                      {file.status === 'processing' ? 'Processing' : file.status === 'done' ? 'Ready' : receipt.date ? formatDate(receipt.date) : 'Queued'}
                    </div>
                    <div className="rounded-xl bg-surface-container px-3 py-2">
                      <CategoryBadge category={receipt.category} size="sm" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 md:items-end">
                {receipt ? (
                  <Button size="sm" onClick={() => onReviewReceipt(receipt.id)}>
                    Review
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => onRemoveFile(file.id)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExportRail() {
  return null;
}
