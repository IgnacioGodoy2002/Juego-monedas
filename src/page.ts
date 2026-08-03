declare global {
    var feather: any;
}

export const renderDialog = (content, fadeIn, closable = true) => {
    // Close any currently existing dialogs
    const dialogElem = document.querySelector('.dialog');
    if (dialogElem) dialogElem.remove();

    const template: HTMLTemplateElement = document.querySelector('#dialog');
    const clone = template.content.cloneNode(true) as HTMLTemplateElement;

    const overlayBackElem: HTMLDivElement = document.querySelector(
        '.overlay-back'
    );

    const closeBtn: HTMLButtonElement = clone.querySelector('button.close');
    if (closable) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const dialog = document.querySelector('.dialog');
            dialog.remove();
            overlayBackElem.style.display = 'none';
        });
    } else {
        closeBtn.style.display = 'none';
    }

    const dialogContent = clone.querySelector('.dialog-content');
    dialogContent.appendChild(content);

    if (fadeIn) {
        const dialog: HTMLDivElement = clone.querySelector('.dialog');
        dialog.style.opacity = '0';
        dialog.style.top = '100%';
        setTimeout(() => {
            const dialog: HTMLDivElement = document.querySelector('.dialog');
            dialog.style.opacity = '';
            dialog.style.top = '';
        }, 10);
    }

    document.body.appendChild(clone);

    overlayBackElem.style.display = 'block';

    if (typeof feather !== 'undefined') {
        feather.replace();
    } else {
        (document.querySelector(
            ".dialog [data-feather='x']"
        ) as HTMLElement).innerText = 'X';
    }
};

export const renderNotification = (msg) => {
    const template: HTMLTemplateElement = document.querySelector(
        '#notification'
    );
    const clone = template.content.cloneNode(true) as HTMLTemplateElement;

    const message: HTMLSpanElement = clone.querySelector(
        '.notification-message'
    );
    message.innerText = msg;

    const notificationArea = document.querySelector('.notification-area');
    notificationArea.appendChild(clone);

    // The original reference is a DocumentFragment, need to find the notification element in the DOM tree to continue using it
    const notificationList: NodeListOf<HTMLDivElement> = notificationArea.querySelectorAll(
        '.notification-area > .notification'
    );
    const notification: HTMLDivElement =
        notificationList[notificationList.length - 1];

    setTimeout(() => {
        notification.style.opacity = '0';

        setTimeout(() => {
            notification.remove();
        }, 1000);
    }, 1000);
};

export const createDialogContentFromTemplate = (tmplContentId) => {
    const contentTmpl = document.querySelector(tmplContentId);
    const contentClone = contentTmpl.content.cloneNode(true);

    return contentClone;
};
