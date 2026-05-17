from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from app.signal_tracker import refresh_all_watchlists


scheduler = BackgroundScheduler(timezone="UTC")


def start_scheduler() -> None:
    if scheduler.running:
        return

    scheduler.add_job(
        refresh_all_watchlists,
        "interval",
        hours=6,
        id="watchlist-refresh",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
