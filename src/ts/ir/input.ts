import {isHeadingMD, isHrMD} from "../util/fixBrowserBehavior";
import {getTopList, hasClosestBlock, hasClosestByClassName, hasClosestByTag} from "../util/hasClosest";
import {log} from "../util/log";
import {getSelectPosition, setRangeByWbr} from "../util/selection";
import {processAfterRender, processCodeRender} from "./process";

export const input = (vditor: IVditor, range: Range) => {
    let blockElement = hasClosestBlock(range.startContainer);
    let afterSpace = "";
    // 前后可以输入空格，但是 insert html 中有换行需忽略（使用 wbr 标识）
    if (blockElement && !blockElement.querySelector("wbr")) {
        if (isHrMD(blockElement.innerHTML) || isHeadingMD(blockElement.innerHTML)) {
            return;
        }

        // 前后空格处理
        const startOffset = getSelectPosition(blockElement, range).start;

        // 开始可以输入空格
        let startSpace = true;
        for (let i = startOffset - 1;
            // 软换行后有空格
             i > blockElement.textContent.substr(0, startOffset).lastIndexOf("\n");
             i--) {
            if (blockElement.textContent.charAt(i) !== " " &&
                // 多个 tab 前删除不形成代码块 https://github.com/Vanessa219/vditor/issues/162 1
                blockElement.textContent.charAt(i) !== "\t") {
                startSpace = false;
                break;
            }
        }
        if (startOffset === 0) {
            startSpace = false;
        }

        // 结尾可以输入空格
        let endSpace = true;
        for (let i = startOffset - 1; i < blockElement.textContent.length; i++) {
            if (blockElement.textContent.charAt(i) !== " " && blockElement.textContent.charAt(i) !== "\n") {
                endSpace = false;
                break;
            }
        }

        if (startSpace || endSpace) {
            const markerElement = hasClosestByClassName(range.startContainer, "vditor-ir__marker");
            if (markerElement && endSpace) {
                // inline marker space https://github.com/Vanessa219/vditor/issues/239
                afterSpace = " ";
            } else {
                return;
            }
        }
    }

    Array.from(vditor.ir.element.querySelectorAll(".vditor-ir__node--expand")).forEach((item) => {
        item.classList.remove("vditor-ir__node--expand");
    });

    if (!blockElement) {
        // 使用顶级块元素，应使用 innerHTML
        blockElement = vditor.ir.element;
    }
    if (!blockElement.querySelector("wbr")) {
        const previewRenderElement = hasClosestByClassName(range.startContainer, "vditor-ir__preview");
        if (previewRenderElement) {
            // 光标如果落在预览区域中，则重置到代码区域
            if (previewRenderElement.previousElementSibling.firstElementChild) {
                range.selectNodeContents(previewRenderElement.previousElementSibling.firstElementChild);
            } else {
                range.selectNodeContents(previewRenderElement.previousElementSibling);
            }
            range.collapse(false);
        }
        // document.exeComment insertHTML 会插入 wbr
        range.insertNode(document.createElement("wbr"));
    }
    // 清除浏览器自带的样式
    blockElement.querySelectorAll("[style]").forEach((item) => {
        item.removeAttribute("style");
    });

    const isIRElement = blockElement.isEqualNode(vditor.ir.element);
    let html = "";
    if (!isIRElement) {
        // 列表需要到最顶层
        const topListElement = getTopList(range.startContainer);
        if (topListElement) {
            const blockquoteElement = hasClosestByTag(range.startContainer, "BLOCKQUOTE");
            if (blockquoteElement) {
                // li 中有 blockquote 就只渲染 blockquote
                blockElement = hasClosestBlock(range.startContainer) || blockElement;
            } else {
                blockElement = topListElement;
            }
        }

        html = blockElement.outerHTML;

        if (blockElement.tagName === "UL" || blockElement.tagName === "OL") {
            // 如果为列表的话，需要把上下的列表都重绘
            const listPrevElement = blockElement.previousElementSibling;
            const listNextElement = blockElement.nextElementSibling;
            if (listPrevElement && (listPrevElement.tagName === "UL" || listPrevElement.tagName === "OL")) {
                html = listPrevElement.outerHTML + html;
                listPrevElement.remove();
            }
            if (listNextElement && (listNextElement.tagName === "UL" || listNextElement.tagName === "OL")) {
                html = html + listNextElement.outerHTML;
                listNextElement.remove();
            }
            // firefox 列表回车不会产生新的 list item https://github.com/Vanessa219/vditor/issues/194
            html = html.replace("<div><wbr><br></div>", "<li><p><wbr><br></p></li>");
        } else if (blockElement.previousElementSibling) {
            // 换行时需要处理上一段落
            html = blockElement.previousElementSibling.outerHTML + html;
            blockElement.previousElementSibling.remove();
        }
    } else {
        html = blockElement.innerHTML;
    }

    log("SpinVditorIRDOM", html, "argument", vditor.options.debugger);
    html = vditor.lute.SpinVditorIRDOM(html) + afterSpace;
    log("SpinVditorIRDOM", html, "result", vditor.options.debugger);

    if (isIRElement) {
        blockElement.innerHTML = html;
    } else {
        blockElement.outerHTML = html;
    }

    setRangeByWbr(vditor.ir.element, range);

    vditor.ir.element.querySelectorAll(".vditor-ir__preview").forEach((item: HTMLElement) => {
        processCodeRender(item, vditor);
    });

    processAfterRender(vditor, {
        enableAddUndoStack: true,
        enableHint: true,
        enableInput: true,
    });
};
