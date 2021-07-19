import * as path from 'path';

export class PathUtil {
	public static pathSepRegex = /(?:\\|\/)+/;

	public static EscapePathParts(file: string) {
		file = unescape(file);
		const parts = file.split('/');

		const newParts = [];
		for (const i in parts) {
			if (parts[i].length > 0) {
				newParts.push(escape(parts[i]));
			}
		}
		return newParts.join('/');
	}

	public static UnescapePathParts(file: string) {
		const parts = file.split('/');
		const newParts = [];
		for (const i in parts) {
			if (parts[i].length > 0) {
				newParts.push(unescape(parts[i]));
			}
		}
		return newParts.join('/');
	}

	public static GetParentDir(file: string) {
		return path.dirname(file);
	}

	public static GetImmediateParentDir(file: string) {
		return PathUtil.GetParentDir(file).split(PathUtil.pathSepRegex).pop();
	}

	public static GetFileName(file: string) {
		return path.basename(file);
	}
	public static PathEquals(file1: string, file2: string) {
		return path.normalize(file1) == path.normalize(file2);
	}
	public static PathBeginsWith(file1: string, file2: string) {
		return path.normalize(file1).startsWith(path.normalize(file2));
	}
	public static ConvertToUnixPath(file: string) {
		return file.replace(/\\/g, '/');
	}

	public static GetUserDataDirFromStorageUri(file: string | undefined) {
		if (!file) {
			return file;
		}
		file = PathUtil.ConvertToUnixPath(file);
		const parts = file.split('/');

		const newParts = [];
		for (const i in parts) {
			if (parts[i].length > 0) {
				newParts.push(parts[i]);
			}
			if (parts[i] == 'User') {
				break;
			} // TODO: find a more direct way of finding user-data-dir
		}

		return newParts.join('/');
	}
}
