import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

# Your existing backend API base URL
BACKEND_API = "https://future-jobs-pro-ai-production.up.railway.app"

class ActionRunPayroll(Action):
    def name(self) -> str:
        return "action_run_payroll"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        date_range = next(tracker.get_latest_entity_values("date_range"), None)
        # Call your backend payroll endpoint (adjust URL as needed)
        try:
            response = requests.post(f"{BACKEND_API}/api/payroll/run", json={"date_range": date_range})
            if response.status_code == 200:
                dispatcher.utter_message(text=f"Payroll for {date_range or 'the period'} has been processed.")
            else:
                dispatcher.utter_message(text="Sorry, I couldn't process payroll at the moment.")
        except Exception:
            dispatcher.utter_message(text="Payroll service is currently unavailable.")
        return []

class ActionCreateSchedule(Action):
    def name(self) -> str:
        return "action_create_schedule"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        employee = next(tracker.get_latest_entity_values("employee"), None)
        day = next(tracker.get_latest_entity_values("day"), None)
        start_time = next(tracker.get_latest_entity_values("start_time"), None)
        # Call your schedule API
        try:
            response = requests.post(f"{BACKEND_API}/api/schedule/shifts", json={
                "name": f"Shift for {employee or 'staff'}",
                "date": day,   # you may want to parse day properly
                "startTime": start_time,
                "endTime": "17:00",
                "notes": f"Scheduled for {employee}"
            })
            if response.status_code == 200:
                dispatcher.utter_message(text=f"Schedule created for {employee or 'employee'} on {day or 'the requested day'}.")
            else:
                dispatcher.utter_message(text="Schedule creation failed.")
        except Exception:
            dispatcher.utter_message(text="Schedule service is unavailable.")
        return []

class ActionGenerateReport(Action):
    def name(self) -> str:
        return "action_generate_report"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        project = next(tracker.get_latest_entity_values("project_name"), None)
        try:
            response = requests.post(f"{BACKEND_API}/api/photos/report", json={
                "projectName": project,
                "reportTitle": f"Evidence Report - {project or 'Project'}"
            })
            if response.status_code == 200:
                dispatcher.utter_message(text=f"Report for {project or 'project'} has been generated.")
            else:
                dispatcher.utter_message(text="Report generation failed.")
        except Exception:
            dispatcher.utter_message(text="Report service is unavailable.")
        return []

class ActionTeamStatus(Action):
    def name(self) -> str:
        return "action_team_status"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        try:
            response = requests.get(f"{BACKEND_API}/api/team")
            if response.status_code == 200:
                data = response.json()
                count = len(data.get("members", []))
                dispatcher.utter_message(text=f"Currently {count} team members are active.")
            else:
                dispatcher.utter_message(text="Unable to fetch team status.")
        except Exception:
            dispatcher.utter_message(text="Team service is unavailable.")
        return []

class ActionClockIn(Action):
    def name(self) -> str:
        return "action_clock_in"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        # In production, you'd extract user ID from the session
        try:
            response = requests.post(f"{BACKEND_API}/api/time-entries/clock-in", json={"userId": "demo"})
            if response.status_code == 200:
                dispatcher.utter_message(text="You've been clocked in. Have a great shift!")
            else:
                dispatcher.utter_message(text="Clock in failed. Please try again.")
        except Exception:
            dispatcher.utter_message(text="Time entry service is unavailable.")
        return []

class ActionClockOut(Action):
    def name(self) -> str:
        return "action_clock_out"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        try:
            response = requests.post(f"{BACKEND_API}/api/time-entries/clock-out", json={"userId": "demo"})
            if response.status_code == 200:
                dispatcher.utter_message(text="You've been clocked out. Enjoy your evening!")
            else:
                dispatcher.utter_message(text="Clock out failed. Please try again.")
        except Exception:
            dispatcher.utter_message(text="Time entry service is unavailable.")
        return []