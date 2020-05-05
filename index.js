import hljs from "highlight.js/lib/highlight";
import "highlight.js/styles/github.css";
import elm from 'highlight.js/lib/languages/elm';
import cpp from 'highlight.js/lib/languages/cpp';
import python from 'highlight.js/lib/languages/python';
// we're just importing the syntaxes we want from hljs
// in order to reduce our JS bundle size
// see https://bjacobel.com/2016/12/04/highlight-bundle-size/
hljs.registerLanguage('elm', elm);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('python', python);


import "./style.css";
// @ts-ignore
window.hljs = hljs;
const { Elm } = require("./src/Main.elm");
const pagesInit = require("elm-pages");

pagesInit({
  mainElmModule: Elm.Main
});
