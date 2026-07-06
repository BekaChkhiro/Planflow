import SwiftUI

@main
struct PlanFlowApp: App {
    @State private var appState = AppState()
    @State private var workspaceStore = WorkspaceStore()
    @State private var projectsStore = ProjectsStore()
    @State private var chatSessions = ChatSessionStore()
    @State private var routineConfigs = RoutineConfigStore()
    @State private var taskRuns = TaskRunStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .environment(workspaceStore)
                .environment(projectsStore)
                .environment(chatSessions)
                .environment(routineConfigs)
                .environment(taskRuns)
                .frame(minWidth: 1040, minHeight: 700)
                .task { await appState.bootstrap() }
        }
        .windowStyle(.hiddenTitleBar)

        Settings {
            SettingsView()
                .environment(appState)
                .frame(width: 520)
                .frame(minHeight: 420)
        }
    }
}
