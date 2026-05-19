<template>
  <div class="welcome-page">
    <div class="welcome-scroll">
      <div class="welcome-content">
        <header class="welcome-header">
          <h1>MarkText</h1>
          <p class="tagline">
            {{ t('welcome.tagline') }}
          </p>
        </header>

        <div class="welcome-columns">
          <section class="welcome-start">
            <h2>{{ t('welcome.start') }}</h2>
            <ul>
              <li @click="newFile">
                <svg
                  class="icon"
                  aria-hidden="true"
                >
                  <use xlink:href="#icon-create" />
                </svg>
                <span>{{ t('welcome.newFile') }}</span>
              </li>
              <li @click="openFile">
                <svg
                  class="icon"
                  aria-hidden="true"
                >
                  <use xlink:href="#icon-files" />
                </svg>
                <span>{{ t('welcome.openFile') }}</span>
              </li>
              <li @click="openFolder">
                <svg
                  class="icon"
                  aria-hidden="true"
                >
                  <use xlink:href="#icon-folder-open" />
                </svg>
                <span>{{ t('welcome.openFolder') }}</span>
              </li>
            </ul>
          </section>

          <section class="welcome-recent">
            <h2>{{ t('welcome.recent') }}</h2>
            <ul v-if="recentDocuments.length">
              <li
                v-for="item in recentDocuments"
                :key="item.path"
                :title="item.path"
                @click="openRecent(item.path)"
              >
                <span class="recent-name">{{ item.name }}</span>
                <span class="recent-dir">{{ item.dir }}</span>
              </li>
            </ul>
            <p
              v-else
              class="recent-empty"
            >
              {{ t('welcome.noRecent') }}
            </p>
          </section>
        </div>
      </div>
    </div>

    <footer class="welcome-footer">
      <label>
        <input
          type="checkbox"
          :checked="showWelcomePage"
          @change="toggleShowOnStartup($event)"
        >
        <span>{{ t('welcome.showOnStartup') }}</span>
      </label>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { t } from '../../i18n'

interface RecentDocument {
  path: string
  name: string
  dir: string
}

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const { showWelcomePage } = storeToRefs(preferencesStore)

const recentDocuments = ref<RecentDocument[]>([])

// Split a full path into a display name and its parent directory, handling
// both POSIX and Windows separators (renderer is ESM-only, no node `path`).
const splitPath = (fullPath: string): RecentDocument => {
  const normalized = fullPath.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return {
    path: fullPath,
    name: index >= 0 ? normalized.slice(index + 1) : normalized,
    dir: index >= 0 ? normalized.slice(0, index) : ''
  }
}

const newFile = () => {
  editorStore.NEW_UNTITLED_TAB({})
}

const openFile = () => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
}

const openFolder = () => {
  window.electron.ipcRenderer.send('mt::cmd-open-folder')
}

const openRecent = (pathname: string) => {
  window.electron.ipcRenderer.send('mt::cmd-open-recent', pathname)
}

const toggleShowOnStartup = (event: Event) => {
  preferencesStore.SET_SINGLE_PREFERENCE({
    type: 'showWelcomePage',
    value: (event.target as HTMLInputElement).checked
  })
}

onMounted(async () => {
  try {
    const documents = await window.electron.ipcRenderer.invoke('mt::get-recently-used-documents')
    recentDocuments.value = (documents || []).map(splitPath)
  } catch {
    recentDocuments.value = []
  }
})
</script>

<style scoped>
.welcome-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor);
  color: var(--editorColor);
  overflow: hidden;
}
.welcome-scroll {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
}
.welcome-content {
  width: 100%;
  max-width: 920px;
  padding: 12vh 48px 48px;
  box-sizing: border-box;
}
.welcome-header h1 {
  margin: 0;
  font-size: 46px;
  font-weight: 300;
  color: var(--editorColor);
}
.welcome-header .tagline {
  margin: 4px 0 0;
  font-size: 18px;
  color: var(--editorColor60);
}
.welcome-columns {
  display: flex;
  margin-top: 48px;
  gap: 64px;
}
.welcome-columns section {
  flex: 1;
  min-width: 0;
}
.welcome-columns h2 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 400;
  color: var(--editorColor);
}
.welcome-columns ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.welcome-columns li {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  margin: 0 -8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--linkColor, var(--themeColor));
}
.welcome-columns li:hover {
  background: var(--sideBarItemHoverBgColor, var(--editorColor10));
}
.welcome-start .icon {
  width: 16px;
  height: 16px;
  margin-right: 10px;
  fill: currentColor;
  flex-shrink: 0;
}
.welcome-recent li {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.welcome-recent .recent-name {
  color: var(--linkColor, var(--themeColor));
}
.welcome-recent .recent-dir {
  margin-left: 10px;
  font-size: 12px;
  color: var(--editorColor60);
}
.welcome-recent .recent-empty {
  margin: 0;
  color: var(--editorColor60);
}
.welcome-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 16px;
  border-top: 1px solid var(--editorColor10);
}
.welcome-footer label {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--editorColor60);
  font-size: 13px;
}
.welcome-footer input {
  margin: 0 8px 0 0;
  cursor: pointer;
}
</style>
