'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearSession, getAuthHeaders, getStoredSession } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import {
  BatchSummary,
  UploadCard,
  UploadedReceiptsList,
  UploadStepper,
  type UploadWorkspaceFile,
} from '@/components/upload-workspace';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_BATCH = 20;

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadWorkspaceFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Unsupported file type. Use JPG, PNG, WebP, or PDF.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File too large. Maximum file size is 10MB.';
    }
    return null;
  };

  const addFiles = useCallback((incomingFiles: FileList | File[]) => {
    const nextFiles = Array.from(incomingFiles);
    if (files.length + nextFiles.length > MAX_BATCH) {
      alert(`You can upload up to ${MAX_BATCH} receipts in one batch.`);
      return;
    }

    setFiles((current) => [
      ...current,
      ...nextFiles.map((file) => {
        const validationError = validateFile(file);
        return {
          id: generateId(),
          file,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          status: validationError ? 'error' : 'queued',
          progress: 0,
          error: validationError || undefined,
        } satisfies UploadWorkspaceFile;
      }),
    ]);
  }, [files.length]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }, [addFiles]);

  const scanFile = async (uploadFile: UploadWorkspaceFile) => {
    const session = getStoredSession();
    if (!session) {
      router.replace('/login');
      throw new Error('Authentication required');
    }

    const formData = new FormData();
    formData.append('file', uploadFile.file);

    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: getAuthHeaders(session),
      body: formData,
    });

    if (response.status === 401) {
      clearSession();
      router.replace('/login');
      throw new Error('Session expired. Please sign in again.');
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail || `Server error: ${response.status}`);
    }

    return response.json();
  };

  const processFiles = async () => {
    const queuedFiles = files.filter((file) => file.status === 'queued');

    for (const queuedFile of queuedFiles) {
      setFiles((current) =>
        current.map((file) =>
          file.id === queuedFile.id ? { ...file, status: 'uploading', progress: 24 } : file,
        ),
      );

      try {
        setFiles((current) =>
          current.map((file) =>
            file.id === queuedFile.id ? { ...file, status: 'processing', progress: 68 } : file,
          ),
        );

        const result = await scanFile(queuedFile);
        if (result.success) {
          setFiles((current) =>
            current.map((file) =>
              file.id === queuedFile.id
                ? { ...file, status: 'done', progress: 100, result }
                : file,
            ),
          );
        } else {
          setFiles((current) =>
            current.map((file) =>
              file.id === queuedFile.id
                ? {
                    ...file,
                    status: 'error',
                    progress: 0,
                    error: result.error || 'Extraction failed',
                  }
                : file,
            ),
          );
        }
      } catch (error: any) {
        setFiles((current) =>
          current.map((file) =>
            file.id === queuedFile.id
              ? {
                  ...file,
                  status: 'error',
                  progress: 0,
                  error: error.message || 'Network error. Please try again.',
                }
              : file,
          ),
        );
      }
    }
  };

  const removeFile = (id: string) => {
    setFiles((current) => {
      const match = current.find((file) => file.id === id);
      if (match?.preview) {
        URL.revokeObjectURL(match.preview);
      }
      return current.filter((file) => file.id !== id);
    });
  };

  const totalQueued = files.filter((file) => file.status === 'queued').length;
  const totalProcessing = files.filter((file) => ['uploading', 'processing'].includes(file.status)).length;
  const totalDone = files.filter((file) => file.status === 'done').length;
  const currentStep: 1 | 2 | 3 = totalDone > 0 ? 3 : totalProcessing > 0 ? 2 : 1;
  const uploadState: 'idle' | 'uploading' | 'processing' | 'review' =
    totalDone > 0
      ? 'review'
      : totalProcessing > 0
        ? 'processing'
        : files.length > 0
          ? 'uploading'
          : 'idle';
  const totalAmount = useMemo(
    () =>
      files.reduce(
        (sum, file) =>
          file.status === 'done' && file.result?.receipt ? sum + file.result.receipt.amount : sum,
        0,
      ),
    [files],
  );

  return (
    <main className="min-h-[calc(100vh-80px)] bg-surface px-4 py-4 md:px-6 md:py-5">
      <div className="mx-auto max-w-[900px]">
        <section className="rounded-[2rem] bg-surface-container-low px-4 py-4 md:px-6 md:py-6">
          <div className="pb-4">
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">New Scan</p>
            <h2 className="mt-1 font-headline text-2xl font-extrabold tracking-[-0.04em] text-primary">Scan a receipt</h2>
          </div>

          <div className="space-y-4 md:space-y-5">
            <UploadStepper currentStep={currentStep} />

            <div className={files.length > 0 ? 'grid gap-4 lg:grid-cols-[1fr_240px] items-start' : ''}>
              <UploadCard
                isDragging={isDragging}
                state={uploadState}
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onOpenPicker={() => fileInputRef.current?.click()}
                onSelectFiles={() => fileInputRef.current?.click()}
                onUseCamera={() => cameraInputRef.current?.click()}
                onStartScan={processFiles}
                onConfirmSave={() => {
                  const firstDoneReceipt = files.find((file) => file.result?.receipt?.id)?.result?.receipt?.id;
                  if (firstDoneReceipt) {
                    router.push(`/receipts/${firstDoneReceipt}`);
                  }
                }}
                fileInput={(
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    multiple
                    className="hidden"
                    onChange={(event) => event.target.files && addFiles(event.target.files)}
                  />
                )}
                cameraInput={(
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => event.target.files && addFiles(event.target.files)}
                  />
                )}
              />

              {files.length > 0 ? (
                <BatchSummary
                  totalQueued={totalQueued}
                  totalDone={totalDone}
                  filesCount={files.length}
                  totalAmount={totalAmount}
                />
              ) : null}
            </div>

            <UploadedReceiptsList
              files={files}
              onRemoveFile={removeFile}
              onReviewReceipt={(id) => router.push(`/receipts/${id}`)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
