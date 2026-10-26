/** A removable `<style>` tag. */
export function createStyle(doc, id) {
	let el = null;
	return {
		set(text) {
			if (!el) {
				el = doc.createElement('style');
				el.setAttribute('data-restyler', id);
			}
			el.textContent = text;
			if (!el.isConnected) (doc.head || doc.documentElement).appendChild(el);
		},
		remove() {
			el?.remove();
			el = null;
		},
	};
}

/** Adds a class to `<html>` (Preact overwrites body.className, so never use body). Returns a remover. */
export function addHtmlClass(doc, name) {
	doc.documentElement.classList.add(name);
	return () => doc.documentElement.classList.remove(name);
}
