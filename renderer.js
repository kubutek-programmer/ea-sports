const box = document.getElementById("chat");
const dialog = document.getElementById("dialog");
const dlgTitle = document.getElementById("dlg-title");
const dlgInput = document.getElementById("dlg-input");
const dlgApply = document.getElementById("dlg-apply");
const dlgCancel = document.getElementById("dlg-cancel");

let currentVideoId = '';
let currentMaxMessages = 200;
let dialogMode = 'video';

window.api.getConfig().then(config => {
  currentVideoId = config.video_id || '';
  currentMaxMessages = config.max_messages || 200;
});

function stringToColor(str) {
	let hash = 0x811c9dc5;

	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}

	hash >>>= 0;

	const hue = hash % 360;
	const saturation = 70;
	const lightness = 50 + ((hash >>> 9) % 26); // 50-75%

	return hslToHex(hue, saturation, lightness);
}

function hslToHex(h, s, l) {
	s /= 100;
	l /= 100;

	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = l - c / 2;

	let r = 0, g = 0, b = 0;

	if (h < 60)      [r, g, b] = [c, x, 0];
	else if (h < 120)[r, g, b] = [x, c, 0];
	else if (h < 180)[r, g, b] = [0, c, x];
	else if (h < 240)[r, g, b] = [0, x, c];
	else if (h < 300)[r, g, b] = [x, 0, c];
	else             [r, g, b] = [c, 0, x];

	return "#" + [r, g, b]
		.map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
		.join("");
}

function showDialog(mode) {
  dialogMode = mode;
  if (mode === 'video') {
    dlgTitle.textContent = 'Change Video ID';
    dlgInput.value = currentVideoId;
    dlgInput.placeholder = 'Enter YouTube Video ID';
  } else {
    dlgTitle.textContent = 'Change Max Messages';
    dlgInput.value = currentMaxMessages;
    dlgInput.placeholder = 'Enter max messages count';
  }
  dialog.style.display = 'block';
  dlgInput.focus();
  dlgInput.select();
}

function hideDialog() {
  dialog.style.display = 'none';
}

window.api.onShowVideoPrompt(() => showDialog('video'));
window.api.onShowMaxMessagesPrompt(() => showDialog('maxMessages'));

dlgApply.addEventListener('click', async () => {
  const val = dlgInput.value.trim();
  if (!val) return;

  dlgApply.disabled = true;

  if (dialogMode === 'video') {
    const result = await window.api.switchVideo(val);
    if (result.success) {
      currentVideoId = val;
      hideDialog();
    }
  } else {
    const count = parseInt(val, 10);
    if (!isNaN(count) && count > 0) {
      await window.api.setMaxMessages(count);
      currentMaxMessages = count;
      hideDialog();
    }
  }

  dlgApply.disabled = false;
});

dlgCancel.addEventListener('click', hideDialog);

dlgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') dlgApply.click();
  if (e.key === 'Escape') hideDialog();
});

window.api.onClearChat(() => {
  box.innerHTML = '';
});

function renderMessageParts(parts) {
	const frag = document.createDocumentFragment();

	for (const part of parts) {
		if (part.type === "text") {
			frag.appendChild(document.createTextNode(part.value));
		}

		if (part.type === "emoji") {
			const img = document.createElement("img");
			img.src = part.url;
			img.alt = part.id;
			img.style.height = "1em";
			img.style.verticalAlign = "middle";
			img.style.display = "inline-block";

			frag.appendChild(img);
		}
	}

	return frag;
}

function addMessage(authorID, authorhandler, message, pfp) {
	const div = document.createElement("div");

	const img = document.createElement("img");
	img.src = pfp;
	img.style.height = "1em";
	img.style.verticalAlign = "middle";

	const author_text = document.createElement("a");
	author_text.style.color = stringToColor(authorID);
	author_text.style.cursor = "pointer";
	author_text.style.textDecoration = "none"
	author_text.textContent = authorhandler;
	author_text.title = authorID;
	author_text.href = `https://www.youtube.com/channel/${authorID}`;

	author_text.addEventListener("click", (e) => {
		e.preventDefault();
		window.api.openExternal(author_text.href);
	});

	const message_span = document.createElement("span");
	message_span.appendChild(renderMessageParts(message));

	div.append(img, ' ', author_text, ': ', message_span);

	box.appendChild(div);

	while (box.children.length > currentMaxMessages) {
		box.removeChild(box.firstChild);
	}

	box.scrollTop = box.scrollHeight;
}

window.api.onMessage(({ authorID, authorhandler, message, pfp }) => {
    addMessage(authorID, authorhandler, message, pfp);
});