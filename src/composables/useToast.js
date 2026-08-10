import { ref } from 'vue'

export const toastMsg = ref('')

let timer

export function toast(msg, ms = 2200) {
  toastMsg.value = msg
  clearTimeout(timer)
  timer = setTimeout(() => {
    toastMsg.value = ''
  }, ms)
}
