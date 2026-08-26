"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./pricing.module.css";

type TestimonialStory = {
  name: string;
  src: string;
  poster: string;
  quote: string;
};

export function TestimonialVideos({
  stories,
}: {
  stories: readonly TestimonialStory[];
}) {
  const [activeStory, setActiveStory] = useState<TestimonialStory | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const modalVideoRef = useRef<HTMLVideoElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeModal = useCallback(() => {
    const video = modalVideoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setActiveStory(null);
    setIsPlaying(false);
    setCurrentTime(0);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!activeStory) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const video = modalVideoRef.current;
    if (video) {
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeStory, closeModal]);

  const startPreview = (button: HTMLButtonElement) => {
    const video = button.querySelector("video");
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  };

  const stopPreview = (button: HTMLButtonElement) => {
    const video = button.querySelector("video");
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  const openModal = (story: TestimonialStory, trigger: HTMLButtonElement) => {
    stopPreview(trigger);
    lastTriggerRef.current = trigger;
    setActiveStory(story);
    setCurrentTime(0);
    setDuration(0);
  };

  const togglePlayback = () => {
    const video = modalVideoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (value: number) => {
    const video = modalVideoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <>
      <div className={styles.videoGrid}>
        {stories.map((story) => (
          <article className={styles.videoCard} key={story.name}>
            <button
              aria-label={`Open ${story.name}'s student testimonial`}
              className={styles.videoTrigger}
              onClick={(event) => openModal(story, event.currentTarget)}
              onMouseEnter={(event) => startPreview(event.currentTarget)}
              onMouseLeave={(event) => stopPreview(event.currentTarget)}
              type="button"
            >
              <span className={styles.videoFrame}>
                <video
                  aria-hidden="true"
                  loop
                  muted
                  playsInline
                  poster={story.poster}
                  preload="metadata"
                  tabIndex={-1}
                >
                  <source src={story.src} type="video/mp4" />
                </video>
              </span>
            </button>
            <div className={styles.videoMeta}>
              <h3>{story.name}&apos;s story</h3>
              <blockquote>“{story.quote}”</blockquote>
            </div>
          </article>
        ))}
      </div>

      {activeStory ? (
        <div
          aria-labelledby="testimonial-modal-title"
          aria-modal="true"
          className={styles.testimonialModal}
          onClick={(event) => {
            if (event.currentTarget === event.target) closeModal();
          }}
          role="dialog"
        >
          <div className={styles.testimonialDialog}>
            <div className={styles.testimonialDialogHeader}>
              <h3 id="testimonial-modal-title">{activeStory.name}&apos;s story</h3>
              <button
                aria-label="Close testimonial"
                className={styles.testimonialClose}
                onClick={closeModal}
                ref={closeButtonRef}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
            <div className={styles.testimonialMedia}>
              <video
                aria-label={`${activeStory.name}'s student testimonial`}
                key={activeStory.src}
                onClick={togglePlayback}
                onEnded={() => setIsPlaying(false)}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                playsInline
                poster={activeStory.poster}
                preload="auto"
                ref={modalVideoRef}
              >
                <source src={activeStory.src} type="video/mp4" />
              </video>
              {!isPlaying ? (
                <button
                  aria-label="Resume testimonial"
                  className={styles.modalPlayButton}
                  onClick={togglePlayback}
                  type="button"
                >
                  <PlayIcon />
                </button>
              ) : null}
              <div className={styles.testimonialControls}>
                <button
                  aria-label={isPlaying ? "Pause testimonial" : "Play testimonial"}
                  onClick={togglePlayback}
                  type="button"
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <input
                  aria-label="Video progress"
                  max={duration || 0}
                  min="0"
                  onChange={(event) => seekTo(Number(event.currentTarget.value))}
                  step="0.1"
                  type="range"
                  value={Math.min(currentTime, duration || 0)}
                />
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
