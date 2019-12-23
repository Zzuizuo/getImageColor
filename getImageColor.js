function themeColor(img, callback) {
	let that = this;
	wx.getImageInfo({
		src: img,
		success: (res) => {
			let canvasW = res.width;
			let canvasH = res.height;
			let radio = Math.trunc(canvasW / 512) == 0 ? 1 : Math.trunc(canvasW / 512);
			canvasW = Math.trunc(res.width / radio);
			canvasH = Math.trunc(res.height / radio);
			that.setData(
				{
					cWidth: canvasW,
					cHeight: canvasH
				},
				() => {
					var ctx = wx.createCanvasContext('compressCanvas');
					ctx.drawImage(res.path, 0, 0, canvasW, canvasH);
					ctx.draw(
						false,
						setTimeout(() => {
							wx.canvasGetImageData({
								canvasId: 'compressCanvas',
								x: 0,
								y: 0,
								width: canvasW,
								height: canvasH,
								success: function(res) {
									let imageData = res.data;
									var total = imageData.length / 4;

									var rMin = 255,
										rMax = 0,
										gMin = 255,
										gMax = 0,
										bMin = 255,
										bMax = 0;

									// 获取范围
									for (var i = 0; i < total; i++) {
										var red = imageData[i * 4],
											green = imageData[i * 4 + 1],
											blue = imageData[i * 4 + 2];

										if (red < rMin) {
											rMin = red;
										}

										if (red > rMax) {
											rMax = red;
										}

										if (green < gMin) {
											gMin = green;
										}

										if (green > gMax) {
											gMax = green;
										}

										if (blue < bMin) {
											bMin = blue;
										}

										if (blue > bMax) {
											bMax = blue;
										}
									}

									var colorRange = [ [ rMin, rMax ], [ gMin, gMax ], [ bMin, bMax ] ];
									var colorBox = new ColorBox(colorRange, total, imageData);

									var colorBoxArr = queueCut([ colorBox ], 8);

									var colorArr = [];
									for (var j = 0; j < colorBoxArr.length; j++) {
										colorBoxArr[j].total && colorArr.push(colorBoxArr[j].getColor());
									}
									console.log(colorArr);

									callback && callback(colorArr);
								},
								fail: function(err) {
									reject(err);
									console.log('压缩错误', err);
								}
							});
						}, 500)
					);
				}
			);
		}
	});
}

/**
     * 颜色盒子类
     *
     * @param {Array} colorRange    [[rMin, rMax],[gMin, gMax], [bMin, bMax]] 颜色范围
     * @param {any} total   像素总数, imageData / 4
     * @param {any} data    像素数据集合
     */
function ColorBox(colorRange, total, data) {
	this.colorRange = colorRange;
	this.total = total;
	this.data = data;
	this.volume =
		(colorRange[0][1] - colorRange[0][0]) *
		(colorRange[1][1] - colorRange[1][0]) *
		(colorRange[2][1] - colorRange[2][0]);
	this.rank = this.total * this.volume;
}

ColorBox.prototype.getColor = function() {
	var total = this.total;
	var data = this.data;

	var redCount = 0,
		greenCount = 0,
		blueCount = 0;

	for (var i = 0; i < total; i++) {
		redCount += data[i * 4];
		greenCount += data[i * 4 + 1];
		blueCount += data[i * 4 + 2];
	}

	return [ parseInt(redCount / total), parseInt(greenCount / total), parseInt(blueCount / total) ];
};

// 获取切割边
function getCutSide(colorRange) {
	// r:0,g:1,b:2
	var arr = [];
	for (var i = 0; i < 3; i++) {
		arr.push(colorRange[i][1] - colorRange[i][0]);
	}
	return arr.indexOf(Math.max(arr[0], arr[1], arr[2]));
}

// 切割颜色范围
function cutRange(colorRange, colorSide, cutValue) {
	var arr1 = [];
	var arr2 = [];
	colorRange.forEach(function(item) {
		arr1.push(item.slice());
		arr2.push(item.slice());
	});
	arr1[colorSide][1] = cutValue;
	arr2[colorSide][0] = cutValue;
	return [ arr1, arr2 ];
}

// 找到出现次数为中位数的颜色
function getMedianColor(colorCountMap, total) {
	var arr = [];
	for (var key in colorCountMap) {
		arr.push({
			color: parseInt(key),
			count: colorCountMap[key]
		});
	}

	var sortArr = __quickSort(arr);
	var medianCount = 0;
	var medianColor = 0;
	var medianIndex = Math.floor(sortArr.length / 2);

	for (var i = 0; i <= medianIndex; i++) {
		medianCount += sortArr[i].count;
	}

	return {
		color: parseInt(sortArr[medianIndex].color),
		count: medianCount
	};

	// 另一种切割颜色判断方法，根据数量和差值的乘积进行判断，自己试验后发现效果不如中位数方法，但是少了排序，性能应该有所提高
	// var count = 0;
	// var colorMin = arr[0].color;
	// var colorMax = arr[arr.length - 1].color
	// for (var i = 0; i < arr.length; i++) {
	//     count += arr[i].count;

	//     var item = arr[i];

	//     if (count * (item.color - colorMin) > (total - count) * (colorMax - item.color)) {
	//         return {
	//             color: item.color,
	//             count: count
	//         }
	//     }
	// }

	return {
		color: colorMax,
		count: count
	};

	function __quickSort(arr) {
		if (arr.length <= 1) {
			return arr;
		}
		var pivotIndex = Math.floor(arr.length / 2),
			pivot = arr.splice(pivotIndex, 1)[0];

		var left = [],
			right = [];
		for (var i = 0; i < arr.length; i++) {
			if (arr[i].count <= pivot.count) {
				left.push(arr[i]);
			} else {
				right.push(arr[i]);
			}
		}
		return __quickSort(left).concat([ pivot ], __quickSort(right));
	}
}

// 切割颜色盒子
function cutBox(colorBox) {
	var colorRange = colorBox.colorRange,
		cutSide = getCutSide(colorRange),
		colorCountMap = {},
		total = colorBox.total,
		data = colorBox.data;

	// 统计出各个值的数量
	for (var i = 0; i < total; i++) {
		var color = data[i * 4 + cutSide];

		if (colorCountMap[color]) {
			colorCountMap[color] += 1;
		} else {
			colorCountMap[color] = 1;
		}
	}
	var medianColor = getMedianColor(colorCountMap, total);
	var cutValue = medianColor.color;
	var cutCount = medianColor.count;
	var newRange = cutRange(colorRange, cutSide, cutValue);
	var box1 = new ColorBox(newRange[0], cutCount, data.slice(0, cutCount * 4)),
		box2 = new ColorBox(newRange[1], total - cutCount, data.slice(cutCount * 4));
	return [ box1, box2 ];
}

// 队列切割
function queueCut(queue, num) {
	while (queue.length < num) {
		queue.sort(function(a, b) {
			return a.rank - b.rank;
		});
		var colorBox = queue.pop();
		var result = cutBox(colorBox);
		queue = queue.concat(result);
	}

	return queue.slice(0, 8);
}
