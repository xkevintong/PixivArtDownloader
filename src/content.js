// Assume artist uses samge image format for all their art, default to jpg
var img_format = ".jpg";

// content.js
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    switch (request.message) {
      case "album":      
        download_album(document);
        break;

      case "artist":
        download_artist();
        break;

      case "art":
        download_art(document);
        break;

      default:
    }
  }
);

function download_art(doc) {
  // Check if document has album page count variable to determine if page is album cover or single image
  var pagesDiv = doc.evaluate('//*[@role="presentation"]//div[@class="gVu_bev"]',
    doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (pagesDiv) {
    // Construct url for album, get document for album and pass to download_album 
    var albumURL = doc.evaluate('//div[@role="presentation"]/div[@role="presentation"]/a', 
      doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.href;
    var album = new XMLHttpRequest();
    album.responseType = "document";
    album.open('GET', albumURL, true);
    album.send();

    album.onload = function () {
      download_album(this.responseXML);
    };
  }
  else {
    // No page count, call download_image
    download_image(doc);
  }
}

function download_album(doc) {
  // Get album size with XPath
  var albumSize = doc.evaluate('//div[@class="page"]//span[@class="total"]',
    doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.textContent;

  // Check first image in album to see if it is in jpg or png format, and assume entire album is as well
  var firstImage = new XMLHttpRequest();
  firstImage.responseType = "document";
  firstImage.open('GET', doc.evaluate('//*[@id="main"]/section/div[1]/a',
    doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.href, true);
  firstImage.send();

  firstImage.onload = function () {
    // Get image format of the album from first image
    var firstImageURL = this.responseXML.evaluate('/html/body/img', 
      this.responseXML, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.src;
    var imageFormat = firstImageURL.substr(firstImageURL.lastIndexOf('.'));

    // Find album ID
    var albumID = firstImageURL.substr(firstImageURL.lastIndexOf('/') + 1).replace("_p0" + imageFormat, "_p");

    // Download all images with XHR blobs
    for (var page = 0; page < albumSize; page++) {
      (function(page) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = "blob";
        xhr.open('GET', firstImageURL.replace("_p0", "_p" + page), true);
        xhr.send();

        // Assign blob response a URL and send message to background.js to download blob
        xhr.onload = function () {
          chrome.runtime.sendMessage({
            message: "download",
            url: URL.createObjectURL(this.response),
            filename: albumID + page + imageFormat
          });
        };
      }(page));
    }
  };
}

function download_image(doc) {
  // Get source image url and id
  var imageURL = doc.evaluate('//*[@role="presentation"]/div[@role="presentation"]/a',
    doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.href
  var imageID = imageURL.substr(imageURL.lastIndexOf('/') + 1);

  var xhr = new XMLHttpRequest();
  xhr.responseType = "blob";
  xhr.open('GET', imageURL, true);
  xhr.send();

  // Assign blob response a URL and send message to background.js to download blob
  xhr.onload = function () {
    chrome.runtime.sendMessage({
      message: "download",
      url: URL.createObjectURL(this.response),
      filename: imageID
    });
  };
}

function download(url, id) {
  // Send xhr request to download image
  var xhr = new XMLHttpRequest();
  xhr.responseType = "blob";
  xhr.open('GET', url, true);
  xhr.send();

  // Assign blob response a URL and send message to background.js to download blob
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      chrome.runtime.sendMessage({
        message: "download",
        url: URL.createObjectURL(this.response),
        filename: id
      });
    }
    else if (xhr.status === 404) {
      // Change extension only if its different
      // and redownload (assumes pixiv only uses .jpg and .png formats)
      var curr_format = url.substring(url.length - 4, url.length);
      if (curr_format === img_format) {        
        img_format = img_format === ".jpg" ? ".png" : ".jpg";

        url = url.substring(0, url.length - 4) + img_format;
        id = id.substring(0, id.length - 4) + img_format;

        download(url, id);
      }

      // Uh-oh
      else {
        console.log("New image extension detected!");
      }
    }
  };
}

function download_artist() {
  // Get snapshot of image/album links from the page
  var snapshot = document.evaluate('//*[@id="wrapper"]//div[@class="_layout-thumbnail"]/img',
    document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

  for (var i = 0; i < snapshot.snapshotLength; i++) {
    var thumb_url = snapshot.snapshotItem(i).src;

    // Check for corresponding page
    var pages = document.evaluate('//*[@id="wrapper"]//ul[@class="_image-items"]/li[' + (i+1) + ']/a[1]/div[@class="page-count"]/span',
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    // Album
    if (pages) {
      var num_pages = pages.innerHTML;
    }

    // Single image
    else {
      // Construct URL
      var orig_url = thumb_url.replace("c/150x150/img-master", "img-original").replace("_master1200.jpg", img_format);

      // Get image id (filename)
      var imageID = orig_url.substring(orig_url.lastIndexOf('/') + 1, orig_url.length - 4) + img_format;

      // Attempt to download image
      var status = download(orig_url, imageID);
    }
  }
}