// Small progressive enhancements. Kept in a file (not inline) so the
// Content-Security-Policy can forbid inline scripts.
document.addEventListener('submit', function (ev) {
    var msg = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) {
        ev.preventDefault();
    }
});

document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el && el.hasAttribute && el.hasAttribute('data-autosubmit') && el.form) {
        el.form.submit();
    }
});
