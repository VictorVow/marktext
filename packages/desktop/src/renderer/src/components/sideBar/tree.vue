<template>
  <div
    ref="treeView"
    class="tree-view"
  >
    <div class="title">
      <!-- Placeholder -->
    </div>

    <!-- Opened tabs -->
    <div
      v-if="openedFilesInSidebar"
      class="opened-files"
    >
      <div class="title">
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showOpenedFiles }"
          :size="12"
          @click.stop="toggleOpenedFiles()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleOpenedFiles()"
        >{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.saveAll')"
          @click.stop="saveAll(false)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-save-all" />
          </svg>
        </a>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.closeAll')"
          @click.stop="saveAll(true)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-close-all" />
          </svg>
        </a>
      </div>
      <div
        v-show="showOpenedFiles"
        ref="openedFilesList"
        class="opened-files-list"
        :style="{ maxHeight: `${openedFilesMaxHeight}px` }"
      >
        <transition-group name="list">
          <opened-file
            v-for="tab of tabs"
            :key="tab.id"
            :file="tab"
          />
        </transition-group>
      </div>
      <div
        v-if="showOpenedFiles && tabCount > MIN_VISIBLE_ROWS"
        class="opened-files-resize"
        @mousedown.prevent="startResize"
      />
    </div>

    <!-- Project tree view -->
    <div
      v-if="projectTree"
      class="project-tree"
    >
      <div
        class="title"
        @contextmenu.prevent="handleRootContextMenu"
      >
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showDirectories }"
          :size="12"
          @click.stop="toggleDirectories()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleDirectories()"
        >{{
          projectTree.name
        }}</span>
      </div>
      <div
        v-show="showDirectories"
        class="tree-wrapper"
      >
        <folder
          v-for="folder of projectTree.folders"
          :key="folder.id"
          :folder="folder"
          :depth="depth"
        />
        <input
          v-show="createCacheDirname === projectTree.pathname"
          ref="input"
          v-model="createName"
          placeholder="Enter .md file name"
          type="text"
          class="new-input"
          :style="{ 'margin-left': `${depth * 5 + 15}px` }"
          @keypress.enter="handleInputEnter"
        >
        <file
          v-for="file of projectTree.files"
          :key="file.id"
          :file="file"
          :depth="depth"
        />
        <div
          v-if="
            projectTree.files.length === 0 &&
              projectTree.folders.length === 0 &&
              createCacheDirname !== projectTree.pathname
          "
          class="empty-project"
        >
          <span>{{ t('sideBar.tree.emptyProject') }}</span>
          <div class="centered-group">
            <button
              class="button-primary"
              @click.stop="createFile"
            >
              {{ t('sideBar.tree.createFile') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div
      v-else
      class="open-project"
    >
      <div class="centered-group">
        <el-button
          text
          bg
          type="primary"
          @click="openFolder"
        >
          {{ t('sideBar.tree.openFolder') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import { createTabReorderDrake } from '../editorWithTabs/tabReorder'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import autoScroll from 'dom-autoscroller'
import type dragula from 'dragula'
import { PATH_SEPARATOR } from '@/config'
import { isMac } from '@/util'
import {
  isEditableTarget,
  isModifierKey,
  isMuyaEditorTarget,
  isNameInput,
  keepsSidebarSelection,
  shouldTrashSelection
} from './trashKey'
import type { TreeNode, TabDescriptor } from './types'

const { t } = useI18n()

const props = defineProps<{
  // The project store seeds `projectTree` as `null` until a folder is
  // opened; the template renders the "open project" empty-state behind
  // `v-if="projectTree"`. Type the prop nullable to match runtime + the
  // template guard.
  projectTree: TreeNode | null
  openedFiles?: TabDescriptor[]
  tabs?: TabDescriptor[]
}>()

const depth = 0
// Persist the section collapse state (#2421). The tree is rendered under a
// v-if and is destroyed when the sidebar collapses to its icon strip, so local
// refs reset to expanded on re-open. Back them with localStorage (like the
// sidebar width) so the state survives a re-mount and app restart.
const SHOW_DIRECTORIES_KEY = 'side-bar-show-directories'
const SHOW_OPENED_FILES_KEY = 'side-bar-show-opened-files'
const readSectionExpanded = (key: string): boolean => localStorage.getItem(key) !== 'false'
const showDirectories = ref(readSectionExpanded(SHOW_DIRECTORIES_KEY))
const showOpenedFiles = ref(readSectionExpanded(SHOW_OPENED_FILES_KEY))

// Must match the `.opened-file` row height in treeOpenedTab.vue.
const ROW_HEIGHT_PX = 28
// The list shows this many rows before it scrolls and offers a resize handle.
const MIN_VISIBLE_ROWS = 4
const MIN_LIST_HEIGHT_PX = MIN_VISIBLE_ROWS * ROW_HEIGHT_PX
// Space kept for the project tree below when the list is dragged taller.
const PROJECT_TREE_RESERVE_PX = 150
const OPENED_FILES_HEIGHT_KEY = 'side-bar-opened-files-height'
const storedListHeight = Number(localStorage.getItem(OPENED_FILES_HEIGHT_KEY))
const listHeight = ref(storedListHeight > 0 ? storedListHeight : MIN_LIST_HEIGHT_PX)
const treeView = ref<HTMLElement | null>(null)
const openedFilesList = ref<HTMLElement | null>(null)
const createName = ref('')
const input = ref<HTMLInputElement | null>(null)

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

// Computed properties
const { createCache } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { renameCache } = storeToRefs(projectStore)
const { openedFilesInSidebar } = storeToRefs(preferencesStore)

// The createCache state is `{ dirname, type }` while an input is shown, and
// `{}` otherwise. Expose a typed accessor for the template so we don't have
// to thread `as any` through every comparison.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

const tabCount = computed(() => props.tabs?.length ?? 0)

// Never taller than the rows themselves, so closing tabs leaves no gap.
const openedFilesMaxHeight = computed(() => {
  if (tabCount.value <= MIN_VISIBLE_ROWS) return MIN_LIST_HEIGHT_PX
  const contentHeight = tabCount.value * ROW_HEIGHT_PX
  return Math.max(MIN_LIST_HEIGHT_PX, Math.min(listHeight.value, contentHeight))
})

// Methods
const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const saveAll = (isClose: boolean): void => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const createFile = (): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  bus.emit('SIDEBAR::new', 'file')
}

const handleRootContextMenu = (event: MouseEvent): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  showContextMenu(event, !!clipboard.value)
}

const toggleOpenedFiles = (): void => {
  showOpenedFiles.value = !showOpenedFiles.value
  localStorage.setItem(SHOW_OPENED_FILES_KEY, String(showOpenedFiles.value))
}

const toggleDirectories = (): void => {
  showDirectories.value = !showDirectories.value
  localStorage.setItem(SHOW_DIRECTORIES_KEY, String(showDirectories.value))
}

let resizeStartY = 0
let resizeStartHeight = 0

const handleResizeMove = (event: MouseEvent): void => {
  const treeViewHeight = treeView.value?.clientHeight ?? Infinity
  const maxHeight = Math.max(MIN_LIST_HEIGHT_PX, treeViewHeight - PROJECT_TREE_RESERVE_PX)
  const height = resizeStartHeight + event.clientY - resizeStartY
  listHeight.value = Math.max(MIN_LIST_HEIGHT_PX, Math.min(height, maxHeight))
}

const stopResize = (): void => {
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
  localStorage.setItem(OPENED_FILES_HEIGHT_KEY, String(listHeight.value))
}

const startResize = (event: MouseEvent): void => {
  resizeStartY = event.clientY
  // Start from the rendered height: the stored one may exceed the content.
  resizeStartHeight = openedFilesMaxHeight.value
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', stopResize)
}

interface AutoScroller {
  readonly down: boolean
  destroy: (forceCleanAnimation?: boolean) => void
}

let drake: dragula.Drake | null = null
let autoScroller: AutoScroller | null = null

const destroyReorder = (): void => {
  autoScroller?.destroy(true)
  autoScroller = null
  drake?.destroy()
  drake = null
}

// The list sits under `v-if="openedFilesInSidebar"`, so it can appear and
// disappear while the tree stays mounted.
watch(openedFilesList, (listEl) => {
  destroyReorder()
  if (!listEl) return
  drake = createTabReorderDrake(listEl, 'vertical')
  autoScroller = autoScroll([listEl], {
    margin: 20,
    maxSpeed: 6,
    scrollWhenOutside: false,
    autoScroll: () => !!autoScroller?.down && !!drake?.dragging
  })
}, { flush: 'post' })

// From createFileOrDirectoryMixins
const handleInputFocus = (): void => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

// Hide the name inputs on outside clicks; their trigger buttons use @click.stop.
const handleDocumentClick = (event: MouseEvent): void => {
  const { target } = event
  if (!target) return

  if (!keepsSidebarSelection(target)) {
    projectStore.CHANGE_ACTIVE_ITEM({})
  }

  if (isNameInput(target)) return
  projectStore.CLEAR_NAME_INPUT_STATE()
}

const handleDocumentContextMenu = (event: MouseEvent): void => {
  const { target } = event
  if (isNameInput(target)) return

  projectStore.CLEAR_NAME_INPUT_STATE()
}

const handleDocumentKeydown = (event: KeyboardEvent): void => {
  const { target, key, metaKey } = event
  const editableTarget = isEditableTarget(target)

  if (key === 'Escape') {
    projectStore.CLEAR_NAME_INPUT_STATE()
  }

  const shouldTrash = shouldTrashSelection({
    key,
    metaKey,
    isMac,
    selection: activeItem.value,
    projectRootPath: props.projectTree?.pathname,
    pathSeparator: PATH_SEPARATOR,
    isEditingName: !!renameCache.value || !!createCacheDirname.value,
    editableTarget,
    allowEditableTarget: isMuyaEditorTarget(target)
  })
  if (shouldTrash) {
    event.preventDefault()
    // Stop the event so the WYSIWYG engine does not also act on this Delete.
    event.stopPropagation()
    // The store drops the selection once the item is really trashed, so a
    // cancelled dialog leaves the target in place for a retry.
    bus.emit('SIDEBAR::remove')
    return
  }

  // Any other key ends the selection, so a later Delete edits text instead of
  // trashing a stale node.
  const hasSelection = !!activeItem.value && Object.keys(activeItem.value).length > 0
  if (!isModifierKey(key) && hasSelection) {
    projectStore.CHANGE_ACTIVE_ITEM({})
  }
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('contextmenu', handleDocumentContextMenu)
  // Capture phase: muya stops keydown propagation for keys it handles.
  document.addEventListener('keydown', handleDocumentKeydown, true)
})

onUnmounted(() => {
  destroyReorder()
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
  bus.off('SIDEBAR::show-new-input', handleInputFocus)
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('contextmenu', handleDocumentContextMenu)
  document.removeEventListener('keydown', handleDocumentKeydown, true)
})
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tree-view > .title {
  height: 35px;
  line-height: 35px;
  padding: 0 15px;
  display: flex;
  flex-shrink: 0;
  flex-direction: row-reverse;
}

.icon-arrow {
  margin-right: 5px;
  transition: transform 0.25s ease-out;
  transform: rotate(90deg);
  color: var(--sideBarTextColor);
  cursor: pointer;
}

.icon-arrow.fold {
  transform: rotate(0);
}

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
}

.opened-files .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.opened-files .title > span {
  flex: 1;
}

.opened-files .title > a {
  display: none;
  text-decoration: none;
  color: var(--sideBarColor);
  margin-left: 8px;
}
.opened-files div.title:hover > a,
.opened-files div.title > a:hover {
  display: block;
}

.opened-files div.title:hover > a:hover,
.opened-files div.title > a:hover:hover {
  color: var(--highlightThemeColor);
}
.opened-files {
  display: flex;
  flex-direction: column;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  overflow: auto;
  flex: 1;
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.opened-files-resize {
  height: 4px;
  flex-shrink: 0;
  cursor: row-resize;
}

.opened-files-resize:hover {
  border-bottom: 2px solid var(--iconColor);
}

.project-tree {
  display: flex;
  flex-direction: column;
  overflow: auto;
  flex: 1;
}

.project-tree > .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.project-tree > .title > span {
  flex: 1;
  user-select: none;
}

.project-tree > .title > a {
  pointer-events: auto;
  cursor: pointer;
  margin-left: 8px;
  color: var(--sideBarIconColor);
  opacity: 0;
}

.project-tree > .title > a:hover {
  color: var(--highlightThemeColor);
}

.project-tree > .title > a.active {
  color: var(--highlightThemeColor);
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.project-tree div.title:hover > a {
  opacity: 1;
}
.open-project {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding-bottom: 100px;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
.new-input {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  width: calc(100% - 45px);
  border-radius: 3px;
}
.tree-wrapper {
  position: relative;
}
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: var(--sideBarTextColor);
  & button {
    margin-top: 10px;
  }
}

.empty-project > a {
  color: var(--highlightThemeColor);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
