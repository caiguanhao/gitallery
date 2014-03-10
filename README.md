gitallery
=========

A git gallery.

Development
-----------

Why encrypt localStorage?

It is possible that you have opened many sites locally on localhost and on
the same port. These sites may include JavaScripts from untrusted sources,
for example, the website analytics JavaScript code. These scripts are able
to collect all localStorage data that was set previously on different site.

You can run grunt with LOCALPWD environment variable and no need to enter
local password on each page reload.

    LOCALPWD=your-password PORT=12345 grunt

Developer
---------

* caiguanhao &lt;caiguanhao@gmail.com&gt;
