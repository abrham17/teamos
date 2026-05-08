"use client";

import { useState, useRef } from "react";
import { Upload, X, Link as LinkIcon, Image as ImageIcon, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onUpload: (url: string) => void;
  teamId: string;
}

export function ImageUploadModal({ open, onClose, onUpload, teamId }: Props) {
  const { error: toastError } = useToast();
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onUpload(url.trim());
      setUrl("");
      onClose();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toastError("Please select an image file.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.postForm<{ url: string }>(`/wiki/${teamId}/upload-image/`, formData);
      onUpload(res.url);
      onClose();
    } catch (err) {
      console.error(err);
      toastError("Failed to upload image.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[var(--surface-1)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <ImageIcon size={20} className="text-[var(--accent)]" />
            Insert Image
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button
              onClick={() => setTab("upload")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all ${
                tab === "upload" ? "bg-[var(--accent)] text-[var(--bg-950)] font-bold shadow-lg" : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              <Upload size={16} />
              Upload
            </button>
            <button
              onClick={() => setTab("url")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all ${
                tab === "url" ? "bg-[var(--accent)] text-[var(--bg-950)] font-bold shadow-lg" : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              <LinkIcon size={16} />
              URL
            </button>
          </div>

          {tab === "upload" ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              {uploading ? (
                <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin" />
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload size={32} className="text-[var(--text-secondary)] group-hover:text-[var(--accent)]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[var(--text-primary)] font-medium">Click to upload or drag & drop</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">PNG, JPG, GIF up to 10MB</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-wider">Image URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/image.png"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full bg-[var(--accent)] text-[var(--bg-950)] font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                Insert Image
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
