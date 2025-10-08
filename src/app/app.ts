import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface LapTime {
  hours: string;
  minutes: string;
  seconds: string;
  milliseconds: string;
}

interface FormattedTime {
  hours: string;
  minutes: string;
  seconds: string;
  milliseconds: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Remove lap by index
  deleteLap(index: number) {
    this.lapTimes.update((laps) => laps.filter((_, i) => i !== index));
  }
  private destroyRef = inject(DestroyRef);

  // Signals for reactive state (Angular v20 новый подход)
  mode = signal<'stopwatch' | 'timer' | 'clock'>('stopwatch');

  // Stopwatch signals
  stopwatchTime = signal(0);
  stopwatchRunning = signal(false);
  lapTimes = signal<LapTime[]>([]);

  // Timer signals
  timerMinutes = signal(5);
  timerSeconds = signal(0);
  timerRemaining = signal(0);
  timerRunning = signal(false);
  timerComplete = signal(false);

  // Clock / Day tab signals
  clockTick = signal(0);
  clockIntervalId?: number;

  // Computed for display
  currentDayName = computed(() => {
    // depend on clockTick so it updates periodically
    this.clockTick();
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return days[new Date().getDay()];
  });

  currentDateString = computed(() => {
    this.clockTick();
    return new Date().toLocaleDateString();
  });

  // User-entered date parsing (e.g. "12 сентября 2009")
  userDateInput = signal('');
  userDate = signal<Date | null>(null);
  userDateError = signal('');

  userDayName = computed(() => {
    const d = this.userDate();
    if (!d) return '';
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return days[d.getDay()];
  });

  userDateString = computed(() => {
    const d = this.userDate();
    return d ? d.toLocaleDateString() : '';
  });

  private parseUserDate(input: string): Date | null {
    if (!input) return null;
    // Try native parse first (ISO or locale-friendly)
    const native = new Date(input);
    if (!isNaN(native.getTime())) return native;

    // Try to parse Russian formatted date like "12 сентября 2009"
    const months: Record<string, number> = {
      'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
      'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11,
      // nominative forms
      'январь': 0, 'февраль': 1, 'март': 2, 'апрель': 3, 'май': 4, 'июнь': 5,
      'июль': 6, 'август': 7, 'сентябрь': 8, 'октябрь': 9, 'ноябрь': 10, 'декабрь': 11
    };

    const m = input.trim().toLowerCase().match(/^(\d{1,2})\s+([а-яё\-]+)\s+(\d{4})$/i);
    if (!m) return null;
    const day = Number(m[1]);
    const monthName = m[2];
    const year = Number(m[3]);
    const month = months[monthName];
    if (month === undefined) return null;
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
  }

  setUserDate(value: string) {
    this.userDateInput.set(value);
    const parsed = this.parseUserDate(String(value || ''));
    if (parsed) {
      this.userDate.set(parsed);
      this.userDateError.set('');
    } else {
      this.userDate.set(null);
      this.userDateError.set('Неверный формат. Используйте: "12 сентября 2009" или ISO YYYY-MM-DD');
    }
  }

  timerPresets = [
    { label: '5 мин', minutes: 5, seconds: 0, value: 300000 },
    { label: '10 мин', minutes: 10, seconds: 0, value: 600000 },
    { label: '15 мин', minutes: 15, seconds: 0, value: 900000 },
    { label: '30 мин', minutes: 30, seconds: 0, value: 1800000 },
    { label: '45 мин', minutes: 45, seconds: 0, value: 2700000 },
    { label: '1 час', minutes: 59, seconds: 59, value: 3600000 },
  ];

  private intervalId?: number;
  private timerStartTimestamp?: number;
  private timerEndTimestamp?: number;

  // Computed signals (реактивные вычисления)
  formattedStopwatch = computed(() => this.formatTime(this.stopwatchTime()));
  formattedTimer = computed(() => this.formatTime(this.timerRemaining()));

  timerProgress = computed(() => {
    const total = this.timerMinutes() * 60 * 1000 + this.timerSeconds() * 1000;
    return total > 0 ? (this.timerRemaining() / total) * 100 : 0;
  });

  constructor() {
    // Effect для секундомера (автоматическое управление)
    effect(() => {
      if (this.stopwatchRunning()) {
        this.intervalId = window.setInterval(() => {
          this.stopwatchTime.update((t) => {
            const MAX_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
            if (t + 10 >= MAX_MS) {
              this.stopwatchRunning.set(false);
              return MAX_MS;
            }
            return t + 10;
          });
        }, 10);
      } else {
        this.clearInterval();
      }
    });

    // Effect для таймера (точное вычисление времени)
    effect(() => {
      if (this.timerRunning()) {
        this.intervalId = window.setInterval(() => {
          if (this.timerEndTimestamp) {
            const remaining = this.timerEndTimestamp - Date.now();
            if (remaining <= 0) {
              this.timerRemaining.set(0);
              this.timerRunning.set(false);
              this.timerComplete.set(true);
              this.clearInterval();
            } else {
              this.timerRemaining.set(remaining);
            }
          }
        }, 10);
      } else {
        this.clearInterval();
      }
    });

    // Автоматическая очистка при уничтожении компонента
    this.destroyRef.onDestroy(() => {
      this.clearInterval();
      if (this.clockIntervalId) {
        window.clearInterval(this.clockIntervalId);
        this.clockIntervalId = undefined;
      }
    });
    // Start a small clock tick to update current day/date once per second
    // (single interval; cleaned up on destroy)
    this.clockIntervalId = window.setInterval(() => {
      this.clockTick.update((t) => t + 1);
    }, 1000);
  }

  private clearInterval() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private formatTime(ms: number): FormattedTime {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    return {
      hours: hours.toString().padStart(2, '0'),
      minutes: minutes.toString().padStart(2, '0'),
      seconds: seconds.toString().padStart(2, '0'),
      milliseconds: milliseconds.toString().padStart(2, '0'),
    };
  }

  // Stopwatch methods
  toggleStopwatchRunning() {
    this.stopwatchRunning.set(!this.stopwatchRunning());
  }

  toggleTimerRunning() {
    this.timerRunning.set(!this.timerRunning());
  }

  resetStopwatch() {
    this.stopwatchRunning.set(false);
    this.stopwatchTime.set(0);
    this.lapTimes.set([]);
  }

  recordLap() {
    const formatted = this.formatTime(this.stopwatchTime());
    this.lapTimes.update((laps) => [formatted, ...laps]);
  }

  // Timer methods
  startTimer() {
    const totalMs = this.timerMinutes() * 60 * 1000 + this.timerSeconds() * 1000;
    if (totalMs > 0) {
      this.timerStartTimestamp = Date.now();
      this.timerEndTimestamp = this.timerStartTimestamp + totalMs;
      this.timerRemaining.set(totalMs);
      this.timerRunning.set(true);
      this.timerComplete.set(false);
    }
  }

  resetTimer() {
    this.timerRunning.set(false);
    this.timerRemaining.set(0);
    this.timerComplete.set(false);
    this.timerStartTimestamp = undefined;
    this.timerEndTimestamp = undefined;
  }

  setTimerMinutes(value: number) {
    const n = Number(value);
    const minutes = Number.isFinite(n) ? Math.max(0, Math.min(59, Math.floor(n))) : 0;
    this.timerMinutes.set(minutes);
  }

  setTimerPreset(minutes: number, seconds: number) {
    const m = Math.max(0, Math.min(59, Math.floor(Number(minutes) || 0)));
    const s = Math.max(0, Math.min(59, Math.floor(Number(seconds) || 0)));
    this.timerMinutes.set(m);
    this.timerSeconds.set(s);
  }
}
